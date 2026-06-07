#!/usr/bin/env python3
"""
server.py — FastAPI sidecar for fill-mask inference.

Supports two inference backends:
  1. BERT-family (ONNX Runtime) — bidirectional Transformer MLM
  2. CBOW Word2Vec (Gensim)     — context-bag averaging + nearest-neighbour

Endpoints
---------
GET  /health                  → {"status": "ok", "loaded_models": [...]}
GET  /models                  → list of available (exported/downloaded) model keys
POST /predict                 → fill-mask predictions
POST /load                    → pre-load a model into memory

POST /predict body (JSON):
{
  "sentence": "The [MASK] is the closest star to Earth.",
  "model":    "cbow",         // optional, default "general"
  "top_k":   5                // optional, default 5
}

Response:
{
  "predictions": [
    {"token": "sun",  "score": 0.823},
    ...
  ],
  "model_used": "cbow",
  "mask_token": "[MASK]",
  "backend":    "cbow"        // "onnx" | "cbow"
}

Run:
    cd /path/to/bert-fill-blank-game
    uvicorn bert_sidecar.server:app --port 8787 --reload
"""

import logging
import re
import time
from pathlib import Path
from typing import Optional

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoTokenizer

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"

# ── BERT model registry ───────────────────────────────────────────────────────
# Each entry: (huggingface_model_id, mask_token, display_name)
BERT_MODEL_META: dict[str, tuple[str, str, str]] = {
    "general":  ("google-bert/bert-base-uncased",                                  "[MASK]", "General BERT"),
    "medical":  ("microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract",           "[MASK]", "BiomedBERT / PubMedBERT"),
    "clinical": ("emilyalsentzer/Bio_ClinicalBERT",                                "[MASK]", "Bio_ClinicalBERT"),
    "science":  ("allenai/scibert_scivocab_uncased",                               "[MASK]", "SciBERT"),
    "finance":  ("yiyanghkust/finbert-pretrain",                                   "[MASK]", "FinBERT"),
    "legal":    ("nlpaueb/legal-bert-base-uncased",                                "[MASK]", "LegalBERT"),
}

# ── CBOW / Word2Vec registry ──────────────────────────────────────────────────
# Each entry: (gensim_bin_path_relative_to_MODELS_DIR, display_name)
CBOW_MODEL_META: dict[str, tuple[str, str]] = {
    "cbow": ("cbow/GoogleNews-vectors-negative300.bin.gz", "Word2Vec CBOW (Google News 300-d)"),
}

# ── In-memory caches ──────────────────────────────────────────────────────────
_bert_cache: dict[str, tuple[ort.InferenceSession, AutoTokenizer]] = {}
_cbow_cache: dict[str, object] = {}   # key → gensim KeyedVectors


# ─────────────────────────────────────────────────────────────────────────────
# BERT helpers
# ─────────────────────────────────────────────────────────────────────────────

def _bert_model_dir(key: str) -> Path:
    return MODELS_DIR / key


def _is_bert_exported(key: str) -> bool:
    d = _bert_model_dir(key)
    return (d / "model_quantized.onnx").exists() or (d / "model.onnx").exists()


def _load_bert(key: str) -> tuple[ort.InferenceSession, AutoTokenizer]:
    if key in _bert_cache:
        return _bert_cache[key]

    if not _is_bert_exported(key):
        raise HTTPException(
            status_code=404,
            detail=(
                f"BERT model '{key}' has not been exported yet. "
                f"Run:  python -m bert_sidecar.export_model --model {key}"
            ),
        )

    d = _bert_model_dir(key)
    onnx_path = d / "model_quantized.onnx"
    if not onnx_path.exists():
        onnx_path = d / "model.onnx"

    log.info(f"Loading ONNX session for '{key}' from {onnx_path} …")
    t0 = time.perf_counter()

    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess_options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(onnx_path), sess_options=sess_options)

    tokenizer_dir = d / "tokenizer"
    if tokenizer_dir.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_dir))
    else:
        hf_id = BERT_MODEL_META[key][0]
        log.warning(f"Tokenizer dir not found; loading from HF hub: {hf_id}")
        tokenizer = AutoTokenizer.from_pretrained(hf_id)

    elapsed = time.perf_counter() - t0
    log.info(f"BERT '{key}' loaded in {elapsed:.2f}s")
    _bert_cache[key] = (session, tokenizer)
    return session, tokenizer


def _fill_mask_bert(
    sentence: str,
    session: ort.InferenceSession,
    tokenizer: AutoTokenizer,
    top_k: int = 5,
) -> list[dict]:
    mask_token: str = tokenizer.mask_token
    text = sentence.replace("[MASK]", mask_token)

    encoding = tokenizer(text, return_tensors="np")
    input_ids: np.ndarray = encoding["input_ids"]
    attention_mask: np.ndarray = encoding["attention_mask"]

    mask_positions = np.where(input_ids[0] == tokenizer.mask_token_id)[0]
    if len(mask_positions) == 0:
        raise HTTPException(status_code=422, detail="No [MASK] token found in sentence.")
    mask_pos = int(mask_positions[0])

    input_names = {inp.name for inp in session.get_inputs()}
    ort_inputs: dict[str, np.ndarray] = {
        "input_ids":      input_ids,
        "attention_mask": attention_mask,
    }
    if "token_type_ids" in input_names:
        ort_inputs["token_type_ids"] = encoding.get(
            "token_type_ids", np.zeros_like(input_ids)
        )

    outputs = session.run(None, ort_inputs)
    logits: np.ndarray = outputs[0]
    mask_logits = logits[0, mask_pos, :]

    exp_logits = np.exp(mask_logits - mask_logits.max())
    probs = exp_logits / exp_logits.sum()

    top_indices = np.argsort(probs)[::-1][:top_k * 3]
    results = []
    for idx in top_indices:
        token = tokenizer.decode([int(idx)]).strip()
        if token and not token.startswith("##"):
            results.append({"token": token, "score": float(probs[idx])})
        if len(results) >= top_k:
            break

    return results[:top_k]


# ─────────────────────────────────────────────────────────────────────────────
# CBOW / Word2Vec helpers
# ─────────────────────────────────────────────────────────────────────────────

def _is_cbow_downloaded(key: str) -> bool:
    rel_path, _ = CBOW_MODEL_META[key]
    return (MODELS_DIR / rel_path).exists()


def _load_cbow(key: str):
    if key in _cbow_cache:
        return _cbow_cache[key]

    if not _is_cbow_downloaded(key):
        raise HTTPException(
            status_code=404,
            detail=(
                f"CBOW model '{key}' has not been downloaded yet. "
                f"Run:  python -m bert_sidecar.export_model --model {key}"
            ),
        )

    rel_path, display_name = CBOW_MODEL_META[key]
    bin_path = MODELS_DIR / rel_path

    log.info(f"Loading Word2Vec model '{key}' from {bin_path} (this may take ~30s) …")
    t0 = time.perf_counter()

    try:
        from gensim.models import KeyedVectors
        kv = KeyedVectors.load_word2vec_format(str(bin_path), binary=True)
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="gensim is not installed. Run: pip install gensim",
        )

    elapsed = time.perf_counter() - t0
    log.info(f"CBOW '{key}' loaded in {elapsed:.2f}s  ({len(kv):,} word vectors)")
    _cbow_cache[key] = kv
    return kv


def _fill_mask_cbow(sentence: str, kv, top_k: int = 5) -> list[dict]:
    """
    CBOW fill-mask via context-bag averaging.

    Algorithm:
      1. Split sentence on [MASK] to get left and right context.
      2. Tokenise both sides; keep only words present in the vocabulary.
      3. Average their embeddings to form a context vector.
      4. Return the top_k most similar words from the vocabulary.
    """
    if "[MASK]" not in sentence:
        raise HTTPException(status_code=422, detail="No [MASK] token found in sentence.")

    parts = sentence.split("[MASK]")
    left_text  = parts[0] if len(parts) > 0 else ""
    right_text = parts[1] if len(parts) > 1 else ""

    def tokenise(text: str) -> list[str]:
        tokens = re.findall(r"[a-zA-Z']+", text.lower())
        stopwords = {"the", "a", "an", "is", "are", "was", "were", "be", "been",
                     "being", "have", "has", "had", "do", "does", "did", "will",
                     "would", "could", "should", "may", "might", "shall", "can",
                     "to", "of", "in", "for", "on", "with", "at", "by", "from",
                     "as", "into", "through", "during", "before", "after", "above",
                     "below", "between", "out", "off", "over", "under", "again",
                     "then", "once", "and", "but", "or", "nor", "so", "yet",
                     "both", "either", "neither", "not", "only", "own", "same",
                     "than", "too", "very", "just", "that", "this", "these", "those",
                     "it", "its", "itself", "he", "she", "they", "we", "you", "i",
                     "his", "her", "their", "our", "your", "my", "me", "him", "us"}
        return [t for t in tokens if t not in stopwords and t in kv]

    context_words = tokenise(left_text) + tokenise(right_text)

    if not context_words:
        # Fallback: use all non-stopword tokens regardless of vocab membership
        all_tokens = re.findall(r"[a-zA-Z']+", (left_text + " " + right_text).lower())
        context_words = [t for t in all_tokens if t in kv]

    if not context_words:
        raise HTTPException(
            status_code=422,
            detail="No context words found in the Word2Vec vocabulary for this sentence.",
        )

    # Average context vectors
    vectors = np.array([kv[w] for w in context_words])
    context_vec = vectors.mean(axis=0)

    # Nearest neighbours (exclude the context words themselves)
    similar = kv.similar_by_vector(context_vec, topn=top_k + len(context_words) + 20)

    results = []
    context_set = set(context_words)
    for word, score in similar:
        # Skip context words, punctuation artifacts, and very short tokens
        if word in context_set or not re.match(r"^[a-zA-Z]{2,}$", word):
            continue
        # Normalise cosine similarity [−1, 1] → [0, 1]
        normalised_score = float((score + 1.0) / 2.0)
        results.append({"token": word, "score": round(normalised_score, 4)})
        if len(results) >= top_k:
            break

    return results


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Fill-Mask Sidecar (BERT + CBOW)",
    description="Domain-specific BERT (ONNX) and Word2Vec CBOW fill-mask inference",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    sentence: str
    model: Optional[str] = "general"
    top_k: Optional[int] = 5


class LoadRequest(BaseModel):
    model: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    bert_loaded  = list(_bert_cache.keys())
    cbow_loaded  = list(_cbow_cache.keys())
    bert_exported = [k for k in BERT_MODEL_META if _is_bert_exported(k)]
    cbow_ready    = [k for k in CBOW_MODEL_META if _is_cbow_downloaded(k)]
    return {
        "status": "ok",
        "loaded_models": bert_loaded + cbow_loaded,
        "exported_models": bert_exported + cbow_ready,
    }


@app.get("/models")
def list_models():
    results = []
    for key, (hf_id, _, name) in BERT_MODEL_META.items():
        results.append({
            "key":      key,
            "name":     name,
            "hf_id":    hf_id,
            "backend":  "onnx",
            "exported": _is_bert_exported(key),
            "loaded":   key in _bert_cache,
        })
    for key, (rel_path, name) in CBOW_MODEL_META.items():
        results.append({
            "key":      key,
            "name":     name,
            "hf_id":    "fse/word2vec-google-news-300",
            "backend":  "cbow",
            "exported": _is_cbow_downloaded(key),
            "loaded":   key in _cbow_cache,
        })
    return results


@app.post("/load")
def load_model(req: LoadRequest):
    key = req.model
    if key in BERT_MODEL_META:
        _load_bert(key)
        return {"status": "loaded", "model": key, "backend": "onnx"}
    if key in CBOW_MODEL_META:
        _load_cbow(key)
        return {"status": "loaded", "model": key, "backend": "cbow"}
    raise HTTPException(status_code=400, detail=f"Unknown model key: {key}")


@app.post("/predict")
def predict(req: PredictRequest):
    model_key = req.model or "general"
    top_k = max(1, min(req.top_k or 5, 20))

    t0 = time.perf_counter()

    if model_key in CBOW_MODEL_META:
        kv = _load_cbow(model_key)
        predictions = _fill_mask_cbow(req.sentence, kv, top_k=top_k)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "predictions":  predictions,
            "model_used":   model_key,
            "mask_token":   "[MASK]",
            "backend":      "cbow",
            "inference_ms": round(elapsed_ms, 1),
        }

    if model_key in BERT_MODEL_META:
        session, tokenizer = _load_bert(model_key)
        predictions = _fill_mask_bert(req.sentence, session, tokenizer, top_k=top_k)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "predictions":  predictions,
            "model_used":   model_key,
            "mask_token":   tokenizer.mask_token,
            "backend":      "onnx",
            "inference_ms": round(elapsed_ms, 1),
        }

    raise HTTPException(status_code=400, detail=f"Unknown model key: {model_key}")
