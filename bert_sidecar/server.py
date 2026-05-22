#!/usr/bin/env python3
"""
server.py — FastAPI ONNX BERT fill-mask sidecar.

Endpoints
---------
GET  /health                  → {"status": "ok", "loaded_models": [...]}
GET  /models                  → list of available (exported) model keys
POST /predict                 → fill-mask predictions
POST /load                    → pre-load a model into memory

POST /predict body (JSON):
{
  "sentence": "The [MASK] is the closest star to Earth.",
  "model":    "medical",      // optional, default "general"
  "top_k":   5                // optional, default 5
}

Response:
{
  "predictions": [
    {"token": "sun",  "score": 0.823},
    {"token": "star", "score": 0.041},
    ...
  ],
  "model_used": "medical",
  "mask_token": "[MASK]"
}

Run:
    cd /path/to/bert-fill-blank-game
    uvicorn bert_sidecar.server:app --port 8787 --reload
"""

import logging
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

# ── Model registry ────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"

MODEL_META = {
    "general":  ("google-bert/bert-base-uncased",                                  "[MASK]", "General BERT"),
    "medical":  ("microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract",           "[MASK]", "BiomedBERT / PubMedBERT"),
    "clinical": ("emilyalsentzer/Bio_ClinicalBERT",                                "[MASK]", "Bio_ClinicalBERT"),
    "science":  ("allenai/scibert_scivocab_uncased",                               "[MASK]", "SciBERT"),
    "finance":  ("yiyanghkust/finbert-pretrain",                                   "[MASK]", "FinBERT"),
    "legal":    ("nlpaueb/legal-bert-base-uncased",                                "[MASK]", "LegalBERT"),
}

# ── In-memory model cache: key → (ort.InferenceSession, AutoTokenizer) ────────
_cache: dict[str, tuple[ort.InferenceSession, AutoTokenizer]] = {}


def _model_dir(key: str) -> Path:
    return MODELS_DIR / key


def _is_exported(key: str) -> bool:
    d = _model_dir(key)
    return (d / "model_quantized.onnx").exists() or (d / "model.onnx").exists()


def _load_model(key: str) -> tuple[ort.InferenceSession, AutoTokenizer]:
    """Load model from disk into the cache (or return cached version)."""
    if key in _cache:
        return _cache[key]

    if not _is_exported(key):
        raise HTTPException(
            status_code=404,
            detail=(
                f"Model '{key}' has not been exported yet. "
                f"Run:  python -m bert_sidecar.export_model --model {key}"
            ),
        )

    d = _model_dir(key)
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
        # Fall back to loading from HF hub (requires internet)
        hf_id = MODEL_META[key][0]
        log.warning(f"Tokenizer dir not found; loading from HF hub: {hf_id}")
        tokenizer = AutoTokenizer.from_pretrained(hf_id)

    elapsed = time.perf_counter() - t0
    log.info(f"'{key}' loaded in {elapsed:.2f}s")
    _cache[key] = (session, tokenizer)
    return session, tokenizer


def _fill_mask(
    sentence: str,
    session: ort.InferenceSession,
    tokenizer: AutoTokenizer,
    top_k: int = 5,
) -> list[dict]:
    """
    Run masked-language-model inference and return top_k token predictions.

    The sentence must contain exactly one [MASK] token (or the model's
    native mask token — we normalise it below).
    """
    mask_token: str = tokenizer.mask_token  # e.g. "[MASK]"

    # Normalise the placeholder to the model's own mask token
    text = sentence.replace("[MASK]", mask_token)

    encoding = tokenizer(text, return_tensors="np")
    input_ids: np.ndarray = encoding["input_ids"]          # (1, seq_len)
    attention_mask: np.ndarray = encoding["attention_mask"]

    # Find the position of the mask token
    mask_positions = np.where(input_ids[0] == tokenizer.mask_token_id)[0]
    if len(mask_positions) == 0:
        raise HTTPException(status_code=422, detail="No [MASK] token found in sentence.")
    mask_pos = int(mask_positions[0])

    # Build ONNX inputs — include token_type_ids only if the model expects it
    input_names = {inp.name for inp in session.get_inputs()}
    ort_inputs: dict[str, np.ndarray] = {
        "input_ids":      input_ids,
        "attention_mask": attention_mask,
    }
    if "token_type_ids" in input_names:
        ort_inputs["token_type_ids"] = encoding.get(
            "token_type_ids", np.zeros_like(input_ids)
        )

    # Run inference
    outputs = session.run(None, ort_inputs)
    logits: np.ndarray = outputs[0]  # (1, seq_len, vocab_size)

    mask_logits = logits[0, mask_pos, :]  # (vocab_size,)

    # Softmax → probabilities
    exp_logits = np.exp(mask_logits - mask_logits.max())
    probs = exp_logits / exp_logits.sum()

    top_indices = np.argsort(probs)[::-1][:top_k]
    results = []
    for idx in top_indices:
        token = tokenizer.decode([int(idx)]).strip()
        if token and not token.startswith("##"):  # skip word-piece continuations
            results.append({"token": token, "score": float(probs[idx])})

    return results[:top_k]


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="BERT Fill-Mask Sidecar",
    description="Domain-specific BERT fill-mask inference via ONNX Runtime",
    version="1.0.0",
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
    return {
        "status": "ok",
        "loaded_models": list(_cache.keys()),
        "exported_models": [k for k in MODEL_META if _is_exported(k)],
    }


@app.get("/models")
def list_models():
    return [
        {
            "key": key,
            "name": meta[2],
            "hf_id": meta[0],
            "exported": _is_exported(key),
            "loaded": key in _cache,
        }
        for key, meta in MODEL_META.items()
    ]


@app.post("/load")
def load_model(req: LoadRequest):
    if req.model not in MODEL_META:
        raise HTTPException(status_code=400, detail=f"Unknown model key: {req.model}")
    _load_model(req.model)
    return {"status": "loaded", "model": req.model}


@app.post("/predict")
def predict(req: PredictRequest):
    model_key = req.model or "general"
    if model_key not in MODEL_META:
        raise HTTPException(status_code=400, detail=f"Unknown model key: {model_key}")

    top_k = max(1, min(req.top_k or 5, 20))

    t0 = time.perf_counter()
    session, tokenizer = _load_model(model_key)
    predictions = _fill_mask(req.sentence, session, tokenizer, top_k=top_k)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    return {
        "predictions": predictions,
        "model_used": model_key,
        "mask_token": tokenizer.mask_token,
        "inference_ms": round(elapsed_ms, 1),
    }
