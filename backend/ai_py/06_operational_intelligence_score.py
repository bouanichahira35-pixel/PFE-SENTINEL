from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, safe_div


def _map_by_product(items: List[Dict[str, Any]], key: str = "product_id") -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for item in items:
        pid = str(item.get(key, ""))
        if pid:
            out[pid] = item
    return out


def score_item(
    feature: Dict[str, Any],
    stockout: Dict[str, Any],
    anomaly: Dict[str, Any],
    behavior: Dict[str, Any],
) -> Dict[str, Any]:
    pid = feature.get("product_id")
    code = feature.get("product_code")
    name = feature.get("product_name")

    cv = safe_div(as_float(feature.get("volatility_exit_30d"), 0.0), max(as_float(feature.get("avg_exit_30d"), 0.1), 0.1), 0.0)
    rotation = safe_div(as_float(feature.get("exits_14d"), 0.0), max(as_float(feature.get("stock_anchor"), 0.0) + as_float(feature.get("entries_14d"), 0.0), 1.0), 0.0)
    stock_ratio = as_float(feature.get("stock_to_threshold_ratio"), 0.0)

    risk_prob = as_float(stockout.get("risk_probability"), 0.0)
    anomaly_score = as_float(anomaly.get("anomaly_score"), 0.0)
    behavior_score = as_float(behavior.get("behavior_stability_score"), 50.0)

    rupture_component = clamp(100.0 - risk_prob, 0.0, 100.0)
    anomaly_component = clamp(100.0 - anomaly_score, 0.0, 100.0)
    stability_component = clamp(100.0 - (cv * 55.0), 0.0, 100.0)
    rotation_component = clamp(rotation * 180.0, 0.0, 100.0)
    service_component = clamp((stock_ratio / 1.8) * 100.0, 0.0, 100.0)

    global_score = (
        rupture_component * 0.28
        + anomaly_component * 0.18
        + stability_component * 0.18
        + rotation_component * 0.16
        + service_component * 0.12
        + behavior_score * 0.08
    )
    global_score = clamp(global_score, 0.0, 100.0)

    level = (
        "Avance" if global_score >= 80
        else "Intermediaire" if global_score >= 60
        else "A renforcer"
    )
    heatmap_level = (
        "green" if risk_prob < 35 and anomaly_score < 35
        else "orange" if risk_prob < 70 and anomaly_score < 70
        else "red"
    )

    return {
        "product_id": pid,
        "code_product": code,
        "product_name": name,
        "operational_intelligence_score": round(global_score, 3),
        "operational_level": level,
        "heatmap_level": heatmap_level,
        "components": {
            "rupture_component": round(rupture_component, 3),
            "anomaly_component": round(anomaly_component, 3),
            "stability_component": round(stability_component, 3),
            "rotation_component": round(rotation_component, 3),
            "service_component": round(service_component, 3),
            "behavior_component": round(behavior_score, 3),
        },
    }


def predict(payload: Dict[str, Any]) -> Dict[str, Any]:
    items = payload.get("items", [])
    stockout_map = _map_by_product(payload.get("stockout_predictions", []))
    anomaly_map = _map_by_product(payload.get("anomaly_predictions", []))
    behavior_map = _map_by_product(payload.get("behavior_predictions", []))

    scores = []
    for feature in items:
        pid = str(feature.get("product_id", ""))
        if not pid:
            continue
        score_row = score_item(
            feature=feature,
            stockout=stockout_map.get(pid, {}),
            anomaly=anomaly_map.get(pid, {}),
            behavior=behavior_map.get(pid, {}),
        )
        scores.append(score_row)

    if scores:
        global_score = sum(as_float(s.get("operational_intelligence_score"), 0.0) for s in scores) / len(scores)
    else:
        global_score = 0.0
    global_score = clamp(global_score, 0.0, 100.0)
    global_level = (
        "Avance" if global_score >= 80
        else "Intermediaire" if global_score >= 60
        else "A renforcer"
    )

    scores.sort(key=lambda s: as_float(s.get("operational_intelligence_score"), 0.0))
    return {
        "global_score": round(global_score, 3),
        "global_level": global_level,
        "product_scores": scores,
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio)))) if rows else 0
    test_rows = rows[idx:] if idx < len(rows) else rows
    pred = predict({"items": test_rows, "stockout_predictions": [], "anomaly_predictions": [], "behavior_predictions": []})
    metrics = {
        "n_samples": len(test_rows),
        "global_score": pred["global_score"],
        "global_level": pred["global_level"],
    }
    return {
        "metrics": metrics,
        "backtesting": {
            "train_samples": idx,
            "test_samples": len(test_rows),
            "test_metrics": metrics,
        },
    }


def main() -> None:
    input_path, output_path = parse_io_args()
    payload = load_payload(input_path)
    mode = str(payload.get("mode", "predict"))

    if mode == "evaluate":
        result = evaluate_rows(
            rows=payload.get("rows", []),
            split_ratio=as_float(payload.get("split_ratio"), 0.8),
        )
    else:
        result = predict(payload)

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
