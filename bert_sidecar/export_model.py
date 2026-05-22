#!/usr/bin/env python3
"""
export_model.py — Download a domain-specific BERT model from Hugging Face,
export it to ONNX format, and INT8-quantize it for fast CPU inference.

Usage:
    python export_model.py --model general
    python export_model.py --model medical
    python export_model.py --model clinical
    python export_model.py --model science
    python export_model.py --model finance
    python export_model.py --model legal
    python export_model.py --model all       # export every model

Output:
    bert_sidecar/models/<model_key>/model.onnx
    bert_sidecar/models/<model_key>/model_quantized.onnx
    bert_sidecar/models/<model_key>/tokenizer/   (vocab + config files)
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

# ── Model registry ────────────────────────────────────────────────────────────
# Each entry: (huggingface_model_id, mask_token, description)
MODELS = {
    "general": (
        "google-bert/bert-base-uncased",
        "[MASK]",
        "General-purpose BERT (Google, trained on BookCorpus + Wikipedia)",
    ),
    "medical": (
        "microsoft/BiomedNLP-BiomedBERT-base-uncased-abstract",
        "[MASK]",
        "BiomedBERT / PubMedBERT — pretrained on PubMed abstracts (Microsoft)",
    ),
    "clinical": (
        "emilyalsentzer/Bio_ClinicalBERT",
        "[MASK]",
        "Bio_ClinicalBERT — trained on MIMIC-III clinical notes",
    ),
    "science": (
        "allenai/scibert_scivocab_uncased",
        "[MASK]",
        "SciBERT — trained on 1.14M scientific papers (Allen AI)",
    ),
    "finance": (
        "yiyanghkust/finbert-pretrain",
        "[MASK]",
        "FinBERT — trained on 4.9B tokens of financial text",
    ),
    "legal": (
        "nlpaueb/legal-bert-base-uncased",
        "[MASK]",
        "LegalBERT — trained on 12 GB of EU/UK legislation and US court cases",
    ),
}

BASE_DIR = Path(__file__).parent / "models"


def export_model(key: str) -> None:
    if key not in MODELS:
        print(f"[ERROR] Unknown model key '{key}'. Choose from: {', '.join(MODELS)}")
        sys.exit(1)

    hf_id, mask_token, description = MODELS[key]
    out_dir = BASE_DIR / key
    onnx_path = out_dir / "model.onnx"
    quantized_path = out_dir / "model_quantized.onnx"
    tokenizer_dir = out_dir / "tokenizer"

    print(f"\n{'='*60}")
    print(f"  Model : {key}")
    print(f"  HF ID : {hf_id}")
    print(f"  Desc  : {description}")
    print(f"  Output: {out_dir}")
    print(f"{'='*60}\n")

    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Download tokenizer ────────────────────────────────────────────
    print("[1/3] Downloading tokenizer…")
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(hf_id)
    tokenizer.save_pretrained(str(tokenizer_dir))
    print(f"      Saved to {tokenizer_dir}")

    # ── Step 2: Export to ONNX via optimum ───────────────────────────────────
    print("[2/3] Exporting model to ONNX (this downloads weights ~440 MB)…")
    from optimum.onnxruntime import ORTModelForMaskedLM
    ort_model = ORTModelForMaskedLM.from_pretrained(hf_id, export=True)
    ort_model.save_pretrained(str(out_dir))

    # optimum saves as model.onnx inside the directory
    saved_onnx = out_dir / "model.onnx"
    if not saved_onnx.exists():
        # Some versions save with a different name; find it
        candidates = list(out_dir.glob("*.onnx"))
        if candidates:
            shutil.move(str(candidates[0]), str(onnx_path))
    print(f"      ONNX model saved: {onnx_path} ({onnx_path.stat().st_size / 1e6:.1f} MB)")

    # ── Step 3: INT8 dynamic quantization ────────────────────────────────────
    print("[3/3] Quantizing to INT8 (reduces size ~4×, speeds up CPU inference)…")
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantize_dynamic(
        str(onnx_path),
        str(quantized_path),
        weight_type=QuantType.QInt8,
    )
    q_size = quantized_path.stat().st_size / 1e6
    orig_size = onnx_path.stat().st_size / 1e6
    print(f"      Quantized model: {quantized_path} ({q_size:.1f} MB, was {orig_size:.1f} MB)")

    print(f"\n✅  '{key}' export complete.\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export a domain-specific BERT model to ONNX + INT8 quantized format."
    )
    parser.add_argument(
        "--model",
        default="general",
        choices=[*MODELS.keys(), "all"],
        help="Which model to export (default: general)",
    )
    args = parser.parse_args()

    if args.model == "all":
        for key in MODELS:
            export_model(key)
    else:
        export_model(args.model)

    print("\nAll done! Run the sidecar with:")
    print("  uvicorn bert_sidecar.server:app --port 8787 --reload\n")


if __name__ == "__main__":
    main()
