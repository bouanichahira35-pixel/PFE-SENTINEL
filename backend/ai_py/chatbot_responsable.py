import argparse
import json
import os
from datetime import datetime
import urllib.request
from typing import Any, Dict, List, Optional


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _pct(value: Any) -> str:
    return f"{_as_float(value, 0.0):.1f}%"


def _qty(value: Any) -> str:
    return str(int(round(_as_float(value, 0.0))))


def _top_items(items: List[Dict[str, Any]], key: str, max_items: int = 5) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    return sorted(items, key=lambda x: _as_float(x.get(key), 0.0), reverse=True)[:max_items]


def _find_focus_product(question: str, stockout_top: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    q = (question or "").lower().strip()
    if not q:
        return None
    for item in stockout_top:
        name = str(item.get("product_name") or "").lower().strip()
        code = str(item.get("code_product") or "").lower().strip()
        if (name and name in q) or (code and code in q):
            return item
    return None


def build_context_text(ctx: Dict[str, Any]) -> str:
    stockout_top = _top_items(ctx.get("stockout_top", []), "risk_probability", 7)
    consumption_top = _top_items(ctx.get("consumption_top", []), "expected_quantity", 7)
    anomaly_top = _top_items(ctx.get("anomaly_top", []), "anomaly_score", 7)
    action_plan = ctx.get("action_plan", []) if isinstance(ctx.get("action_plan", []), list) else []
    metrics = ctx.get("metrics", {}) if isinstance(ctx.get("metrics", {}), dict) else {}

    compact = {
        "stockout_top": [
            {
                "product_name": x.get("product_name"),
                "code_product": x.get("code_product"),
                "risk_probability": x.get("risk_probability"),
                "recommended_order_qty": x.get("recommended_order_qty"),
                "current_stock": x.get("current_stock"),
                "seuil_minimum": x.get("seuil_minimum"),
                "factors": x.get("factors", []),
                "explanation": x.get("explanation", ""),
            }
            for x in stockout_top
        ],
        "consumption_top": [
            {
                "product_name": x.get("product_name"),
                "code_product": x.get("code_product"),
                "expected_quantity": x.get("expected_quantity"),
                "expected_daily": x.get("expected_daily"),
            }
            for x in consumption_top
        ],
        "anomaly_top": [
            {
                "product_name": x.get("product_name"),
                "anomaly_score": x.get("anomaly_score"),
                "risk_level": x.get("risk_level"),
                "reason": x.get("reason"),
            }
            for x in anomaly_top
        ],
        "action_plan": action_plan[:7],
        "metrics": metrics,
    }

    return (
        "CONTEXTE OPERATOIRE (donnees reelles + predictions):\n"
        + json.dumps(compact, ensure_ascii=False, indent=2)
    )


def _build_priority_lines(ctx: Dict[str, Any], max_items: int = 3) -> List[str]:
    stockout_top = _top_items(ctx.get("stockout_top", []), "risk_probability", max_items)
    lines: List[str] = []
    for item in stockout_top:
        name = item.get("product_name") or item.get("code_product") or "Produit"
        risk = _pct(item.get("risk_probability"))
        order_qty = _qty(item.get("recommended_order_qty"))
        lines.append(f"- {name}: risque {risk}, commande conseillee {order_qty} unite(s).")
    if not lines:
        lines.append("- Aucun produit critique detecte pour le moment.")
    return lines


def fallback_chat_answer(question: str, ctx: Dict[str, Any]) -> str:
    q = (question or "").lower()
    stockout_top = _top_items(ctx.get("stockout_top", []), "risk_probability", 5)
    anomaly_top = _top_items(ctx.get("anomaly_top", []), "anomaly_score", 5)
    action_plan = ctx.get("action_plan", []) if isinstance(ctx.get("action_plan", []), list) else []
    metrics = ctx.get("metrics", {}) if isinstance(ctx.get("metrics", {}), dict) else {}

    focus = _find_focus_product(question, stockout_top) or (stockout_top[0] if stockout_top else None)
    lines: List[str] = []
    lines.append("Je te fais un point clair et actionnable.")

    if "anomal" in q:
        if anomaly_top:
            top_anomaly = anomaly_top[0]
            lines.append(
                f"Anomalie principale: {top_anomaly.get('product_name', 'Produit')} ({_pct(top_anomaly.get('anomaly_score'))})."
            )
            reason = top_anomaly.get("reason")
            if reason:
                lines.append(f"Cause probable: {reason}.")
        else:
            lines.append("Aucune anomalie forte detectee sur la periode recente.")
    elif "metrique" in q or "fiabil" in q or "performance" in q:
        st = metrics.get("stockout_j7", {}) if isinstance(metrics.get("stockout_j7", {}), dict) else {}
        co = metrics.get("consumption_j14", {}) if isinstance(metrics.get("consumption_j14", {}), dict) else {}
        lines.append(
            "Fiabilite actuelle: "
            f"Rupture F1={st.get('f1', '-')}, AUC={st.get('auc', '-')}; "
            f"Conso MAE={co.get('mae', '-')}, MAPE={co.get('mape', '-')}%."
        )
    elif focus:
        risk = _pct(focus.get("risk_probability"))
        lines.append(f"Produit prioritaire: {focus.get('product_name', 'Produit')} ({risk}).")
        factors = focus.get("factors", [])
        if isinstance(factors, list) and factors:
            lines.append(f"Pourquoi: {', '.join(str(x) for x in factors[:3])}.")
        elif focus.get("explanation"):
            lines.append(f"Pourquoi: {focus.get('explanation')}.")
    else:
        lines.append("Aucun signal critique detecte pour le moment.")

    lines.append("")
    lines.append("Actions immediates:")
    if action_plan:
        for step in action_plan[:3]:
            product_name = step.get("product_name", "Produit")
            action = step.get("action", "Action")
            urgency = step.get("urgency", "normale")
            lines.append(f"- {product_name}: {action} (urgence {urgency}).")
    else:
        for fallback_line in _build_priority_lines(ctx, 3):
            lines.append(fallback_line)

    lines.append("")
    lines.append("Si tu veux, je peux aussi te generer un mini-rapport exportable maintenant.")
    return "\n".join(lines)


def fallback_report_answer(question: str, ctx: Dict[str, Any]) -> str:
    _ = question
    now_label = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    stockout_top = _top_items(ctx.get("stockout_top", []), "risk_probability", 5)
    anomaly_top = _top_items(ctx.get("anomaly_top", []), "anomaly_score", 3)
    action_plan = ctx.get("action_plan", []) if isinstance(ctx.get("action_plan", []), list) else []
    metrics = ctx.get("metrics", {}) if isinstance(ctx.get("metrics", {}), dict) else {}
    st = metrics.get("stockout_j7", {}) if isinstance(metrics.get("stockout_j7", {}), dict) else {}
    co = metrics.get("consumption_j14", {}) if isinstance(metrics.get("consumption_j14", {}), dict) else {}

    lines: List[str] = [
        f"# Mini-rapport stock ({now_label})",
        "",
        "## Resume executif",
    ]

    if stockout_top:
        top = stockout_top[0]
        lines.append(
            f"- Priorite la plus critique: {top.get('product_name', 'Produit')} avec un risque de { _pct(top.get('risk_probability')) }."
        )
    else:
        lines.append("- Aucun produit critique detecte a cet instant.")

    lines.extend(
        [
            "",
            "## Top priorites",
        ]
    )
    for item in stockout_top[:5]:
        name = item.get("product_name") or item.get("code_product") or "Produit"
        risk = _pct(item.get("risk_probability"))
        order_qty = _qty(item.get("recommended_order_qty"))
        lines.append(f"- {name}: risque {risk}, commande recommandee {order_qty} unite(s).")
    if not stockout_top:
        lines.append("- Aucune priorite a forte criticite.")

    lines.extend(
        [
            "",
            "## Actions recommandees (24h)",
        ]
    )
    if action_plan:
        for step in action_plan[:5]:
            lines.append(
                f"- {step.get('product_name', 'Produit')}: {step.get('action', 'Action')}"
                f" (urgence {step.get('urgency', 'normale')})."
            )
    else:
        lines.extend(
            [
                "- Verifier le stock physique des references critiques.",
                "- Lancer les commandes sur les produits a risque eleve.",
                "- Relancer la prediction apres toute entree importante.",
            ]
        )

    lines.extend(
        [
            "",
            "## Qualite modele",
            f"- Rupture J+7: F1={st.get('f1', '-')}, AUC={st.get('auc', '-')}",
            f"- Consommation J+14: MAE={co.get('mae', '-')}, MAPE={co.get('mape', '-')}%",
        ]
    )

    if anomaly_top:
        lines.append("")
        lines.append("## Anomalies a surveiller")
        for item in anomaly_top:
            lines.append(
                f"- {item.get('product_name', 'Produit')}: score { _pct(item.get('anomaly_score')) }"
                f" (niveau {item.get('risk_level', '-')})."
            )

    lines.extend(
        [
            "",
            "## Note",
            "- Ce rapport est genere automatiquement a partir des predictions et historiques disponibles.",
        ]
    )
    return "\n".join(lines)


def call_gemini(system_instruction: str, question: str, context_text: str, history: List[Dict[str, str]], mode: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "")
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY missing")

    url = f"{GEMINI_BASE_URL}/models/{model}:generateContent?key={api_key}"
    contents = []
    for h in history[-12:]:
        role = "model" if h.get("role") == "model" else "user"
        text = str(h.get("text", "")).strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text[:4000]}]})
    mode_instruction = (
        "MODE=REPORT. Produis un mini-rapport markdown structure, concret, avec sections et puces."
        if mode == "report"
        else "MODE=CHAT. Reponds de maniere naturelle, concise, utile, sans style robotique."
    )
    contents.append(
        {
            "role": "user",
            "parts": [{"text": f"{mode_instruction}\n\n{context_text}\n\nQuestion utilisateur:\n{question}"}],
        }
    )

    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction[:4000]}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.25 if mode == "report" else 0.45,
            "maxOutputTokens": 1600 if mode == "report" else 1100,
        },
    }

    req = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = (
        "".join(p.get("text", "") for p in (data.get("candidates", [{}])[0].get("content", {}).get("parts", [])))
    ).strip()
    if not text:
        raise RuntimeError("Empty Gemini response")
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    question = str(payload.get("question", "")).strip()
    context = payload.get("context", {}) or {}
    history = payload.get("history", []) or []
    use_gemini = bool(payload.get("use_gemini", True))
    strict_gemini = bool(payload.get("strict_gemini", False))

    if not question:
        result = {"answer": "Question vide. Merci de preciser votre demande.", "source": "fallback"}
    else:
        mode = str(payload.get("mode", "chat")).strip().lower()
        if mode not in {"chat", "report"}:
            mode = "chat"

        context_text = build_context_text(context)
        if mode == "report":
            system_instruction = (
                "Tu es un copilote stock pour un responsable. "
                "Tu rediges des mini-rapports executifs en francais. "
                "Contraintes: format markdown, sections courtes, actions priorisees, chiffres du contexte uniquement, "
                "pas de blabla, pas d'invention."
            )
        else:
            system_instruction = (
                "Tu es un assistant stock conversationnel en francais. "
                "Tu parles de facon naturelle, claire, professionnelle et humaine. "
                "Toujours: expliquer simplement le pourquoi, puis proposer des actions immediates. "
                "Ne jamais inventer des donnees absentes du contexte."
            )
        try:
            if use_gemini:
                answer = call_gemini(system_instruction, question, context_text, history, mode)
                result = {"answer": answer, "source": "gemini", "mode": mode}
            else:
                raise RuntimeError("Gemini disabled")
        except Exception as exc:
            if use_gemini and strict_gemini:
                result = {
                    "error": "Gemini call failed",
                    "details": str(exc)[:1200],
                    "source": "gemini_error",
                    "mode": mode,
                }
            else:
                answer = fallback_report_answer(question, context) if mode == "report" else fallback_chat_answer(question, context)
                result = {"answer": answer, "source": "fallback", "mode": mode}

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
