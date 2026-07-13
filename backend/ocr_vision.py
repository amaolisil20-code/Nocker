"""OCR de notas/cupons: Tesseract + OCR.space + IA em texto."""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import shutil
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

from ocr_parser import parse_ocr_text, _classify_category

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "")
OCR_SPACE_API_KEY = os.environ.get("OCR_SPACE_API_KEY", "helloworld")
VALID_CATEGORIES = {"Mercado", "Alimentação", "Transporte", "Saúde", "Compras"}

PLACEHOLDER_KEYS = {"", "qualquer-coisa", "your-emergent-llm-key", "your-anthropic-api-key"}

TEXT_EXTRACT_PROMPT = """Analise o texto OCR de uma nota fiscal, cupom ou comprovante Pix brasileiro.

Retorne APENAS JSON válido:
{"establishment":"nome da loja","amount":0.00,"category":"Compras","transaction_date":"YYYY-MM-DD"}

amount = total pago; category = Mercado|Alimentação|Transporte|Saúde|Compras"""


def _manual_fallback(warning: str, ocr_text: str = "") -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "establishment": "",
        "amount": None,
        "category": "Compras",
        "transaction_date": now,
        "ocr_text": ocr_text,
        "warnings": [warning],
        "errors": [],
        "ok": True,
    }


def _is_valid_key(key: str) -> bool:
    k = (key or "").strip()
    return bool(k) and k.lower() not in PLACEHOLDER_KEYS


def _anthropic_client():
    key = ANTHROPIC_API_KEY if _is_valid_key(ANTHROPIC_API_KEY) else ""
    if not key and _is_valid_key(EMERGENT_LLM_KEY):
        key = EMERGENT_LLM_KEY.strip()
    if not key:
        return None
    try:
        import anthropic
    except ImportError:
        return None
    kwargs: Dict[str, Any] = {"api_key": key}
    if ANTHROPIC_BASE_URL:
        kwargs["base_url"] = ANTHROPIC_BASE_URL
    return anthropic.Anthropic(**kwargs)


def _find_tesseract_cmd() -> str:
    for path in (
        shutil.which("tesseract"),
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
    ):
        if path and os.path.isfile(path):
            return path
    return ""


def tesseract_available() -> bool:
    return bool(_find_tesseract_cmd())


def _jpeg_bytes(content: bytes, max_dim: int = 1400) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(content))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()


def _score_parsed(text: str) -> float:
    if not text or len(text.strip()) < 4:
        return 0.0
    parsed = parse_ocr_text(text)
    score = float(len(text.strip()))
    if parsed.get("amount"):
        score += 500
    est = (parsed.get("establishment") or "").strip()
    if est and est != "Estabelecimento não identificado":
        score += 300
    return score


def _run_tesseract(content: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""

    cmd = _find_tesseract_cmd()
    if not cmd:
        return ""
    pytesseract.pytesseract.tesseract_cmd = cmd

    jpeg = _jpeg_bytes(content)
    img = Image.open(io.BytesIO(jpeg)).convert("L")
    best = ""
    best_score = 0.0
    for cfg in ("--oem 3 --psm 6", "--oem 3 --psm 4"):
        try:
            text = pytesseract.image_to_string(img, lang="por", config=cfg)
            score = _score_parsed(text or "")
            if score > best_score:
                best_score, best = score, text or ""
            if score >= 800:
                return best
        except Exception as exc:
            logger.debug("tesseract %s: %s", cfg, exc)
    return best


def _run_ocr_space(content: bytes) -> str:
    """OCR na nuvem — funciona mesmo sem Tesseract no servidor."""
    try:
        jpeg = _jpeg_bytes(content, max_dim=1200)
        if len(jpeg) > 900_000:
            jpeg = _jpeg_bytes(content, max_dim=900)
        b64 = base64.b64encode(jpeg).decode("ascii")
        resp = requests.post(
            "https://api.ocr.space/parse/image",
            data={
                "apikey": OCR_SPACE_API_KEY,
                "language": "por",
                "isOverlayRequired": "false",
                "detectOrientation": "true",
                "scale": "true",
                "OCREngine": "2",
                "base64Image": f"data:image/jpeg;base64,{b64}",
            },
            timeout=55,
        )
        data = resp.json()
        if data.get("IsErroredOnProcessing"):
            logger.warning("OCR.space erro: %s", data.get("ErrorMessage"))
            return ""
        parts: List[str] = []
        for item in data.get("ParsedResults") or []:
            t = (item.get("ParsedText") or "").strip()
            if t:
                parts.append(t)
        text = "\n".join(parts)
        if text.strip():
            logger.info("OCR.space leu %d chars", len(text.strip()))
        return text
    except Exception as exc:
        logger.warning("OCR.space falhou: %s", exc)
        return ""


def _read_image_text(content: bytes) -> tuple[str, str]:
    text = _run_tesseract(content)
    if text.strip():
        return text, "tesseract"
    text = _run_ocr_space(content)
    if text.strip():
        return text, "ocr_space"
    return "", ""


def _parse_json_from_text(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    m = re.search(r"\{[\s\S]*\}", raw.strip())
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _vision_result_to_parse(data: Dict[str, Any], ocr_text: str = "") -> Dict[str, Any]:
    establishment = str(data.get("establishment") or "").strip()
    amount_raw = data.get("amount")
    amount: Optional[float] = None
    if amount_raw is not None:
        try:
            if isinstance(amount_raw, str):
                s = amount_raw.strip().replace("R$", "").replace(" ", "")
                if "," in s and "." in s:
                    s = s.replace(".", "").replace(",", ".")
                elif "," in s:
                    s = s.replace(",", ".")
                amount_raw = s
            amount = float(amount_raw)
            if amount <= 0:
                amount = None
        except (TypeError, ValueError):
            amount = None

    category = str(data.get("category") or "Compras").strip()
    if category not in VALID_CATEGORIES:
        category = _classify_category(f"{establishment} {ocr_text}")

    tx_date = data.get("transaction_date")
    transaction_date: Optional[str] = None
    if tx_date:
        try:
            if isinstance(tx_date, str) and len(tx_date) >= 10:
                dt = datetime.strptime(tx_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                transaction_date = dt.isoformat()
        except ValueError:
            pass
    if not transaction_date:
        transaction_date = datetime.now(timezone.utc).isoformat()

    full_ocr = str(data.get("ocr_text") or ocr_text or "").strip()
    warnings: List[str] = []
    if not establishment:
        warnings.append("Confira o nome do estabelecimento.")
    if amount is None:
        warnings.append("Nenhum valor encontrado. Informe o valor manualmente.")

    return {
        "establishment": establishment or "Estabelecimento não identificado",
        "amount": amount,
        "category": category,
        "transaction_date": transaction_date,
        "ocr_text": full_ocr,
        "warnings": warnings,
        "errors": [],
        "ok": True,
    }


def _run_llm_text_extract(ocr_text: str) -> Optional[Dict[str, Any]]:
    client = _anthropic_client()
    if not client or not ocr_text.strip():
        return None
    try:
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=900,
            messages=[{
                "role": "user",
                "content": f"{TEXT_EXTRACT_PROMPT}\n\n---\n{ocr_text[:10000]}",
            }],
        )
        raw = "\n".join(b.text for b in response.content if hasattr(b, "text"))
        parsed = _parse_json_from_text(raw)
        if not parsed:
            return None
        result = _vision_result_to_parse(parsed, ocr_text)
        result["source"] = "llm_text"
        return result
    except Exception as exc:
        logger.warning("LLM texto falhou: %s", exc)
        return None


def _is_good_parse(result: Dict[str, Any]) -> bool:
    has_amount = result.get("amount") is not None and float(result["amount"]) > 0
    est = (result.get("establishment") or "").strip()
    has_est = bool(est) and est != "Estabelecimento não identificado"
    return has_amount and has_est


def _merge_parsed(text: str, source: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    parsed["source"] = source
    parsed["ocr_text"] = text
    return parsed


def _process_text(text: str, source: str) -> Optional[Dict[str, Any]]:
    if not text or len(text.strip()) < 4:
        return None
    parsed = parse_ocr_text(text)
    if _is_good_parse(parsed):
        return _merge_parsed(text, source, parsed)

    llm = _run_llm_text_extract(text)
    if llm and _is_good_parse(llm):
        llm["ocr_text"] = text
        return llm
    if llm and (llm.get("amount") or (llm.get("establishment") or "").strip()):
        llm["ocr_text"] = text
        return llm

    if parsed.get("amount") or (
        (parsed.get("establishment") or "").strip()
        and parsed["establishment"] != "Estabelecimento não identificado"
    ):
        return _merge_parsed(text, source, parsed)

    if llm:
        llm["ocr_text"] = text
        return llm
    return _merge_parsed(text, source, parsed)


def extract_from_image(content: bytes) -> Dict[str, Any]:
    if len(content) > 12 * 1024 * 1024:
        return _manual_fallback("Imagem muito grande. Tente uma foto com menor resolução.")
    if len(content) < 100:
        return _manual_fallback("Imagem inválida. Tente outra foto.")

    text, source = _read_image_text(content)
    if text.strip():
        result = _process_text(text, source)
        if result:
            return result

    return _manual_fallback(
        "Não foi possível ler a nota. Enquadre o cupom inteiro com boa luz e tente de novo.",
        text or "",
    )


def warmup_ocr() -> None:
    def _check():
        logger.info(
            "OCR warmup: tesseract=%s llm=%s",
            tesseract_available(),
            _anthropic_client() is not None,
        )

    threading.Thread(target=_check, daemon=True).start()
