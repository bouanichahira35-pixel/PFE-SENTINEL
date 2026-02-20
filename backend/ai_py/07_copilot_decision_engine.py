from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, safe_div


def _map_by_product(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        pid = str(row.get("product_id", ""))
        if pid:
            out[pid] = row
    return out


def _urgency(risk: float, days_cover: float, anomaly: float) -> str:
    if risk >= 70.0 or days_cover <= 3.0 or anomaly >= 70.0:
        return "critique"
    if risk >= 45.0 or days_cover <= 7.0 or anomaly >= 50.0:
        return "haute"
    return "normale"


def _risk_level(risk: float) -> str:
    if risk >= 70.0:
        return "eleve"
    if risk >= 40.0:
        return "moyen"
    return "faible"


def build_recommendations(payload: Dict[str, Any]) -> Dict[str, Any]:
    horizon_days = max(1, min(30, int(payload.get("horizon_days", 14) or 14)))
    top_n = max(1, min(20, int(payload.get("top_n", 10) or 10)))

    stockout = payload.get("stockout_predictions", [])
    consumption = payload.get("consumption_predictions", [])
    anomaly = payload.get("anomaly_predictions", [])
    adaptive = payload.get("adaptive_threshold_predictions", [])
    behavior = payload.get("behavior_predictions", [])
    intelligence = payload.get("intelligence_scores", {})
    simulations = payload.get("simulations", [])
    dashboard_curves = payload.get("dashboard_curves", [])

    consumption_map = _map_by_product(consumption)
    anomaly_map = _map_by_product(anomaly)
    adaptive_map = _map_by_product(adaptive)
    behavior_map = _map_by_product(behavior)
    intelligence_products = _map_by_product(intelligence.get("product_scores", []) if isinstance(intelligence, dict) else [])

    merged: List[Dict[str, Any]] = []
    for row in stockout:
        pid = str(row.get("product_id", ""))
        if not pid:
            continue
        c = consumption_map.get(pid, {})
        a = anomaly_map.get(pid, {})
        t = adaptive_map.get(pid, {})
        b = behavior_map.get(pid, {})
        i = intelligence_products.get(pid, {})

        risk = as_float(row.get("risk_probability"), 0.0)
        anomaly_score = as_float(a.get("anomaly_score"), 0.0)
        days_cover = as_float(row.get("days_cover_estimate"), 9999.0)
        expected_need = as_float(c.get("expected_quantity"), as_float(row.get("expected_need"), 0.0))
        stock_anchor = as_float(row.get("current_stock"), 0.0)
        threshold = as_float(row.get("seuil_minimum"), 0.0)
        recommended_threshold = as_float(t.get("recommended_threshold"), threshold)
        base_reco = int(round(as_float(row.get("recommended_order_qty"), 0.0)))
        threshold_reco = int(round(max(0.0, recommended_threshold - stock_anchor)))
        quantity_reco = max(base_reco, threshold_reco)

        explanation_parts: List[str] = []
        factors = row.get("factors", []) if isinstance(row.get("factors", []), list) else []
        if factors:
            explanation_parts.append(", ".join(str(x) for x in factors[:2]))
        if a.get("reason"):
            explanation_parts.append(str(a.get("reason")))
        if b.get("behavior_class"):
            explanation_parts.append(f"classe {b.get('behavior_class')}")
        if not explanation_parts:
            explanation_parts.append("risque calcule par le moteur adaptatif")

        merged.append({
            **row,
            "risk_probability": round(risk, 3),
            "risk_level": _risk_level(risk),
            "anomaly_score": round(anomaly_score, 3),
            "behavior_class": b.get("behavior_class", "Stable"),
            "recommended_threshold": round(recommended_threshold, 3),
            "expected_need": round(expected_need, 3),
            "recommended_order_qty": quantity_reco,
            "urgency": _urgency(risk, days_cover, anomaly_score),
            "operational_intelligence_score": as_float(i.get("operational_intelligence_score"), as_float(intelligence.get("global_score"), 0.0)),
            "explanation": " + ".join(explanation_parts),
        })

    merged.sort(
        key=lambda item: (
            as_float(item.get("risk_probability"), 0.0),
            as_float(item.get("anomaly_score"), 0.0),
            as_float(item.get("recommended_order_qty"), 0.0),
        ),
        reverse=True,
    )
    top = merged[:top_n]

    action_plan = []
    for idx, item in enumerate(top):
        action_plan.append({
            "rank": idx + 1,
            "product_id": item.get("product_id"),
            "code_product": item.get("code_product"),
            "product_name": item.get("product_name"),
            "urgency": item.get("urgency"),
            "action": f"Commander {int(item.get('recommended_order_qty', 0))} unite(s)",
            "why": item.get("explanation"),
            "risk_probability": item.get("risk_probability"),
        })

    simulation_results = []
    top_map = _map_by_product(top)
    for sim in simulations if isinstance(simulations, list) else []:
        pid = str(sim.get("product_id", ""))
        order_qty = as_float(sim.get("order_qty"), -1.0)
        if not pid or order_qty < 0:
            continue
        base = top_map.get(pid)
        if not base:
            base = next((item for item in merged if str(item.get("product_id", "")) == pid), None)
        if not base:
            continue

        risk_before = as_float(base.get("risk_probability"), 0.0)
        expected_need = max(1.0, as_float(base.get("expected_need"), 1.0))
        projected_stock_before = as_float(base.get("projected_stock_end"), 0.0)
        risk_drop = min(90.0, safe_div(order_qty, expected_need, 0.0) * 55.0)
        risk_after = clamp(risk_before - risk_drop, 0.0, 100.0)

        simulation_results.append({
            "product_id": pid,
            "code_product": base.get("code_product"),
            "product_name": base.get("product_name"),
            "order_qty": round(order_qty, 3),
            "risk_before_pct": round(risk_before, 3),
            "risk_after_pct": round(risk_after, 3),
            "projected_stock_end_before": round(projected_stock_before, 3),
            "projected_stock_end_after": round(projected_stock_before + order_qty, 3),
        })

    heatmap = []
    for item in top:
        color = "red" if item["risk_probability"] >= 70 else "orange" if item["risk_probability"] >= 40 else "green"
        heatmap.append({
            "product_id": item.get("product_id"),
            "product_name": item.get("product_name"),
            "risk_probability": item.get("risk_probability"),
            "anomaly_score": item.get("anomaly_score"),
            "behavior_class": item.get("behavior_class"),
            "color": color,
        })

    result = {
        "generated_at": payload.get("generated_at"),
        "horizon_days": horizon_days,
        "top_risk_products": top,
        "action_plan": action_plan,
        "simulations": simulation_results,
        "heatmap_criticality": heatmap,
        "operational_intelligence": {
            "global_score": as_float(intelligence.get("global_score"), 0.0) if isinstance(intelligence, dict) else 0.0,
            "global_level": intelligence.get("global_level", "A renforcer") if isinstance(intelligence, dict) else "A renforcer",
        },
        "dashboard_curves": dashboard_curves if isinstance(dashboard_curves, list) else [],
    }
    return result


def main() -> None:
    input_path, output_path = parse_io_args()
    payload = load_payload(input_path)
    result = build_recommendations(payload)
    dump_output(output_path, result)


if __name__ == "__main__":
    main()
