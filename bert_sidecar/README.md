# BERT Fill-Mask Sidecar

A local Python FastAPI service that runs **domain-specific BERT models via ONNX Runtime** alongside the Fill in the Blank game. When the sidecar is running, the game uses true BERT token-probability predictions instead of the built-in LLM fallback.

---

## Architecture

```
Browser (React)
    │
    ▼
Node.js / tRPC server  ──► [BERT sidecar running?]
    │                              │ YES → POST http://127.0.0.1:8787/predict
    │                              │        (ONNX Runtime, ~5–50 ms)
    │                              │ NO  → invokeLLM() fallback
    ▼
Game response
```

The Node.js server checks the sidecar health every 30 seconds. If it is unavailable (not started, crashed, or model not yet exported), it falls back to the built-in LLM automatically — no configuration required.

---

## Available Models

| Key | Model | Domain | Hugging Face ID |
|---|---|---|---|
| `general` | Google BERT | General English | `google-bert/bert-base-uncased` |
| `medical` | BiomedBERT / PubMedBERT | Biomedical (PubMed abstracts) | `microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract` |
| `clinical` | Bio_ClinicalBERT | Clinical notes (MIMIC-III) | `emilyalsentzer/Bio_ClinicalBERT` |
| `science` | SciBERT | Scientific papers | `allenai/scibert_scivocab_uncased` |
| `finance` | FinBERT | Financial text (10-K, earnings calls) | `yiyanghkust/finbert-pretrain` |
| `legal` | LegalBERT | EU/UK legislation, US court cases | `nlpaueb/legal-bert-base-uncased` |

Each model is ~440 MB on disk before quantization, ~110 MB after INT8 quantization.

---

## Prerequisites

- Python 3.9 or later
- ~2 GB of free disk space per model (original + ONNX + quantized)
- Internet access for the first download (models are cached locally afterwards)

---

## Quick Start

### 1. Install Python dependencies

From the project root:

```bash
# Install torch CPU build first (required before other packages)
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu

# Then install the rest
pip install -r bert_sidecar/requirements.txt
```

Or with a virtual environment (recommended):

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install torch CPU build first
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu

# Then install the rest
pip install -r bert_sidecar/requirements.txt
```

### 2. Export a model to ONNX

Export the **general** BERT model (fastest, ~440 MB download):

```bash
python -m bert_sidecar.export_model --model general
```

Export the **medical** BiomedBERT model:

```bash
python -m bert_sidecar.export_model --model medical
```

Export **all** models at once (requires ~3 GB disk, takes 10–30 min):

```bash
python -m bert_sidecar.export_model --model all
```

The export script will:
1. Download the tokenizer and model weights from Hugging Face (~440 MB each).
2. Export the model to ONNX format using `optimum`.
3. Apply INT8 dynamic quantization (reduces size ~4×, speeds up CPU inference).

Exported files are saved to `bert_sidecar/models/<key>/`:
```
bert_sidecar/models/
  general/
    model.onnx              ← full-precision ONNX (~440 MB)
    model_quantized.onnx    ← INT8 quantized (~110 MB, used by server)
    tokenizer/              ← vocab + config files
  medical/
    ...
```

### 3. Start the sidecar server

```bash
uvicorn bert_sidecar.server:app --port 8787 --reload
```

The server starts at `http://127.0.0.1:8787`. Keep this terminal open while playing.

### 4. Start the game (in a separate terminal)

```bash
pnpm dev
```

Open the game in your browser. The home page will show a green **"BERT Sidecar active"** badge when the connection is established.

---

## API Reference

### `GET /health`

Returns server status and loaded models.

```json
{
  "status": "ok",
  "loaded_models": ["general"],
  "exported_models": ["general", "medical"]
}
```

### `GET /models`

Lists all supported models with export and load status.

```json
[
  { "key": "general",  "name": "General BERT",    "hf_id": "google-bert/bert-base-uncased", "exported": true,  "loaded": true  },
  { "key": "medical",  "name": "BiomedBERT",       "hf_id": "microsoft/...",                 "exported": true,  "loaded": false },
  { "key": "science",  "name": "SciBERT",          "hf_id": "allenai/...",                   "exported": false, "loaded": false }
]
```

### `POST /predict`

Run fill-mask inference.

**Request:**
```json
{
  "sentence": "The [MASK] is the powerhouse of the cell.",
  "model": "medical",
  "top_k": 5
}
```

**Response:**
```json
{
  "predictions": [
    { "token": "mitochondria", "score": 0.412 },
    { "token": "nucleus",      "score": 0.183 },
    { "token": "ribosome",     "score": 0.091 },
    { "token": "membrane",     "score": 0.054 },
    { "token": "cytoplasm",    "score": 0.038 }
  ],
  "model_used": "medical",
  "mask_token": "[MASK]",
  "inference_ms": 23.4
}
```

### `POST /load`

Pre-load a model into memory (avoids cold-start latency on first prediction).

```json
{ "model": "medical" }
```

---

## Performance

| Model | First inference (cold load) | Subsequent inferences |
|---|---|---|
| `general` (quantized) | ~2–5 s | ~10–50 ms |
| `medical` (quantized) | ~2–5 s | ~10–50 ms |
| Any model (full ONNX) | ~5–10 s | ~30–120 ms |

Cold load time depends on disk speed. Models are cached in memory for the lifetime of the server process.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BERT_SIDECAR_URL` | `http://127.0.0.1:8787` | URL the Node.js server uses to reach the sidecar. Override if you run on a different port. |

Set in the project root `.env` (never commit this file):

```bash
BERT_SIDECAR_URL=http://127.0.0.1:8787
```

---

## Troubleshooting

**"Model not exported" error from `/predict`**
Run the export script first: `python -m bert_sidecar.export_model --model <key>`

**Sidecar shows offline in the game UI**
Make sure `uvicorn bert_sidecar.server:app --port 8787` is running in a separate terminal. The Node.js server polls `/health` every 30 seconds.

**`optimum` import errors**
Ensure you installed `optimum[onnxruntime]` (with the extras bracket), not just `optimum`.

**Slow first inference**
The first call loads the ONNX session from disk. Use `POST /load` at startup to pre-warm the model, or simply wait for the first game round to complete the load.

**Out of memory**
Each quantized model uses ~200–400 MB of RAM. Running all 6 simultaneously requires ~2 GB. Load only the models you need.

---

## File Structure

```
bert_sidecar/
  __init__.py          ← Python package marker
  export_model.py      ← Download + ONNX export + INT8 quantize
  server.py            ← FastAPI sidecar with /predict endpoint
  requirements.txt     ← Python dependencies
  README.md            ← This file
  models/              ← Created by export_model.py (gitignored)
    general/
    medical/
    ...
```
