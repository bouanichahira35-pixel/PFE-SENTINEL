from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, safe_div


def _compute(features: Dict[str, Any]) -> Dict[str, float]:
    avg7 = as_float(features.get("avg_exit_7d"), 0.0)
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    vol30 = as_float(features.get("volatility_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    threshold = as_float(features.get("seuil_minimum"), 0.0)
    stock_anchor = as_float(features.get("stock_anchor"), 0.0)
    lead = max(1.0, as_float(features.get("supplier_lead_time_days"), 7.0))

    avg_daily = max(0.0, avg7 * 0.60 + avg30 * 0.40 + max(0.0, trend) * 0.05)
    cv = safe_div(vol30, max(avg30, 0.1), 0.0)
    dynamic_margin = avg_daily * max(2.0, lead * 0.65) * (1.0 + min(cv, 1.5))
    recommended_threshold = max(0.0, avg_daily * lead + dynamic_margin)
    threshold_gap = recommended_threshold - threshold
    pressure = clamp(safe_div(max(0.0, recommended_threshold - stock_anchor), max(recommended_threshold, 1.0), 0.0), 0.0, 1.0)

    if recommended_threshold > threshold * 1.15:
        action = "raise"
    elif recommended_threshold < threshold * 0.80:
        action = "reduce"
    else:
        action = "keep"

    return {
        "avg_daily": avg_daily,
        "cv": cv,
        "dynamic_margin": dynamic_margin,
        "recommended_threshold": recommended_threshold,
        "safety_stock": dynamic_margin,
        "threshold_gap": threshold_gap,
        "pressure": pressure,
        "action": action,
    }


def predict_one(features: Dict[str, Any]) -> Dict[str, Any]:
    comp = _compute(features)
    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "recommended_threshold": round(comp["recommended_threshold"], 4),
        "safety_stock": round(comp["safety_stock"], 4),
        "threshold_gap": round(comp["threshold_gap"], 4),
        "threshold_action": comp["action"],
        "pressure_score": round(comp["pressure"] * 100.0, 3),
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "avg_recommended_threshold": 0,
            "avg_safety_stock": 0,
            "avg_threshold_gap": 0,
            "breach_precision_proxy": 0,
            "breach_recall_proxy": 0,
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    sum_threshold = 0.0
    sum_safety = 0.0
    sum_gap = 0.0

    tp = fp = fn = 0
    for row in test_rows:
        pred = predict_one(row)
        rec = as_float(pred.get("recommended_threshold"), 0.0)
        cur_stock = as_float(row.get("stock_anchor"), 0.0)
        label = int(as_float(row.get("target_threshold_breach"), as_float(row.get("target_stockout_j7"), 0.0)) >= 1.0)
        predicted_breach = 1 if cur_stock < rec else 0

        if predicted_breach == 1 and label == 1:
            tp += 1
        elif predicted_breach == 1 and label == 0:
            fp += 1
        elif predicted_breach == 0 and label == 1:
            fn += 1

        sum_threshold += rec
        sum_safety += as_float(pred.get("safety_stock"), 0.0)
        sum_gap += as_float(pred.get("threshold_gap"), 0.0)

    precision = safe_div(tp, tp + fp, 0.0)
    recall = safe_div(tp, tp + fn, 0.0)
    metrics = {
        "n_samples": len(test_rows),
        "avg_recommended_threshold": round(sum_threshold / max(1, len(test_rows)), 4),
        "avg_safety_stock": round(sum_safety / max(1, len(test_rows)), 4),
        "avg_threshold_gap": round(sum_gap / max(1, len(test_rows)), 4),
        "breach_precision_proxy": round(precision, 4),
        "breach_recall_proxy": round(recall, 4),
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
        items = payload.get("items", [])
        predictions = [predict_one(item) for item in items]
        result = {"predictions": predictions}

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
