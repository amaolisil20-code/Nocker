"""Extrai dados de notas/cupons a partir de texto OCR — sem IA externa."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

CATEGORY_RULES: List[Tuple[str, List[str]]] = [
    ("Alimentação", ["ifood", "restaurante", "hamburgueria", "pizzaria", "lanchonete", "doces", "doce", "padaria", "confeitaria", "varejista de doces"]),
    ("Mercado", ["supermercado", "atacadão", "atacadao", "carrefour", "extra", "dia", "mart minas", "bh supermercados", "pão de açúcar", "pao de acucar"]),
    ("Transporte", ["uber", "99", "combustível", "combustivel", "posto", "shell", "ipiranga"]),
    ("Saúde", ["farmácia", "farmacia", "drogaria", "hospital", "clínica", "clinica"]),
    ("Compras", ["magazine luiza", "americanas", "mercado livre", "amazon", "shopee"]),
]

TOTAL_PATTERNS = [
    re.compile(r"(?:valor\s+)?total\s*(?:r\$)?\s*([\d.,]+)", re.I),
    re.compile(r"total\s*r\$\s*([\d.,]+)", re.I),
    re.compile(r"venda\s+pix[^\n]{0,40}r\$\s*([\d.,]+)", re.I),
    re.compile(r"r\$\s*([\d.,]+)\s*$", re.I | re.M),
    re.compile(r"r\$\s*([\d.,]+)", re.I),
]

DATE_PATTERNS = [
    re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b"),
    re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{2})\b"),
]

MONEY_RE = re.compile(r"(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)")


def _parse_money(raw: str) -> Optional[float]:
    s = raw.strip().replace("R$", "").replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def _extract_amounts(text: str) -> Tuple[List[float], List[float]]:
    total_hits: List[float] = []
    all_hits: List[float] = []
    for pat in TOTAL_PATTERNS:
        for m in pat.finditer(text):
            v = _parse_money(m.group(1))
            if v:
                total_hits.append(v)
    for m in MONEY_RE.finditer(text):
        v = _parse_money(m.group(1))
        if v:
            all_hits.append(v)
    return total_hits, all_hits


def _extract_date(text: str) -> Optional[str]:
    for pat in DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        d, mo, y = m.groups()
        year = int(y)
        if year < 100:
            year += 2000
        try:
            dt = datetime(int(year), int(mo), int(d), tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return None


def _extract_merchant(lines: List[str]) -> str:
    candidates: List[str] = []
    skip_re = re.compile(
        r"(cnpj|cpf|\bie\b|cupom|nota fiscal|documento|auxiliar|via\s*-|loja\s*-|estab\s|aut-|cv-|"
        r"\bpix\b|venda\s+pix|\bcompra\b|transa|sief|fiserv|sitef|cliente\))",
        re.I,
    )
    for line in lines[:16]:
        clean = re.sub(r"[^\w\s&./-]", " ", line).strip()
        if len(clean) < 3:
            continue
        if skip_re.search(clean):
            continue
        if re.fullmatch(r"[\d\s./:-]+", clean):
            continue
        candidates.append(clean)
    if not candidates:
        return "Estabelecimento não identificado"
    upper = [c for c in candidates if c.upper() == c and re.search(r"[A-Z]", c)]
    return (upper[0] if upper else candidates[0])[:120]


def _classify_category(text: str) -> str:
    low = text.lower()
    for category, keywords in CATEGORY_RULES:
        if any(k in low for k in keywords):
            return category
    return "Compras"


def parse_ocr_text(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    warnings: List[str] = []
    errors: List[str] = []

    if len(raw) < 8:
        warnings.append("Pouco texto detectado. Confira ou preencha os dados manualmente.")
        return {
            "establishment": "",
            "amount": None,
            "category": "Compras",
            "transaction_date": datetime.now(timezone.utc).isoformat(),
            "ocr_text": raw,
            "warnings": warnings,
            "errors": errors,
            "ok": True,
        }

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    establishment = _extract_merchant(lines)
    total_hits, all_hits = _extract_amounts(raw)
    if total_hits:
        amount = max(total_hits)
    elif all_hits:
        # Cupons Pix repetem o valor — usar o maior plausível (geralmente o total)
        plausible = [v for v in all_hits if 0.01 <= v <= 500_000]
        amount = max(plausible) if plausible else max(all_hits)
    else:
        amount = None
    transaction_date = _extract_date(raw)
    category = _classify_category(f"{establishment} {raw}")

    if amount is None:
        warnings.append("Nenhum valor encontrado. Informe o valor manualmente.")
    if not transaction_date:
        warnings.append("Nenhuma data encontrada. Será usada a data de hoje.")
        transaction_date = datetime.now(timezone.utc).isoformat()

    if establishment == "Estabelecimento não identificado":
        warnings.append("Não foi possível identificar o estabelecimento. Edite antes de salvar.")

    return {
        "establishment": establishment,
        "amount": amount,
        "category": category,
        "transaction_date": transaction_date,
        "ocr_text": raw,
        "warnings": warnings,
        "errors": errors,
        "ok": len(errors) == 0,
    }
