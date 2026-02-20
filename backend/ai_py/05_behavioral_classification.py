from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, safe_div


def classify_one(features: Dict[str, Any]) -> Dict[str, Any]:
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    vol30 = as_float(features.get("volatility_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    stock_ratio = as_float(features.get("stock_to_threshold_ratio"), 0.0)
    days_cover = as_float(features.get("days_cover_estimate"), 0.0)
    exits14 = as_float(features.get("exits_14d"), 0.0)
    entries14 = as_float(features.get("entries_14d"), 0.0)
    stock_anchor = as_float(features.get("stock_anchor"), 0.0)

    cv = safe_div(vol30, max(avg30, 0.1), 0.0)
    rotation = safe_div(exits14, max(stock_anchor + entries14, 1.0), 0.0)
    trend_ratio = safe_div(abs(trend), max(avg30, 0.1), 0.0)

    critical_flag = (
        stock_ratio <= 1.0
        or days_cover <= 3.0
        or as_float(features.get("target_stockout_j7"), 0.0) >= 1.0
    )

    if critical_flag:
        label = "Critique"
    elif avg30 >= 8.0 and rotation >= 0.35:
        label = "Strategique"
    elif cv >= 0.45 or trend_ratio >= 0.30:
        label = "Variable"
    else:
        label = "Stable"

    score = clamp(
        (1.0 - clamp(cv, 0.0, 1.5) / 1.5) * 35.0
        + clamp(safe_div(stock_ratio, 2.0, 0.0), 0.0, 1.0) * 35.0
        + clamp(safe_div(days_cover, 14.0, 0.0), 0.0, 1.0) * 30.0,
        0.0,
        100.0,
    )

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "behavior_class": label,
        "behavior_stability_score": round(score, 3),
        "consumption_cv_30d": round(cv, 6),
        "rotation_rate_14d": round(rotation, 6),
        "days_cover_estimate": round(days_cover, 3),
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "distribution": {},
            "critical_recall_proxy": 0,
            "critical_precision_proxy": 0,
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    distribution: Dict[str, int] = {}
    tp = fp = fn = 0
    for row in test_rows:
        pred = classify_one(row)
        label = pred["behavior_class"]
        distribution[label] = distribution.get(label, 0) + 1
        true_risk = int(as_float(row.get("target_stockout_j7"), 0.0) >= 1.0)
        pred_critical = 1 if label == "Critique" else 0
        if pred_critical == 1 and true_risk == 1:
            tp += 1
        elif pred_critical == 1 and true_risk == 0:
            fp += 1
        elif pred_critical == 0 and true_risk == 1:
            fn += 1

    metrics = {
        "n_samples": len(test_rows),
        "distribution": distribution,
        "critical_recall_proxy": round(safe_div(tp, tp + fn, 0.0), 4),
        "critical_precision_proxy": round(safe_div(tp, tp + fp, 0.0), 4),
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
        predictions = [classify_one(item) for item in items]
        result = {"predictions": predictions}

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
