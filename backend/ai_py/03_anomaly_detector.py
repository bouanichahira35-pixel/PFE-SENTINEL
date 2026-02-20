from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, roc_auc, safe_div


def predict_one(features: Dict[str, Any]) -> Dict[str, Any]:
    avg7 = as_float(features.get("avg_exit_7d"), 0.0)
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    vol30 = as_float(features.get("volatility_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    entries14 = as_float(features.get("entries_14d"), 0.0)
    exits14 = as_float(features.get("exits_14d"), 0.0)
    days_cover = as_float(features.get("days_cover_estimate"), 0.0)

    spike_ratio = safe_div(avg7, max(avg30, 0.1), 1.0)
    variability_ratio = safe_div(vol30, max(avg30, 0.1), 0.0)
    flow_ratio = safe_div(exits14, max(entries14, 0.1), 0.0)

    score = clamp(
        (spike_ratio - 1.0) * 0.42
        + max(0.0, trend) * 0.10
        + variability_ratio * 0.25
        + max(0.0, flow_ratio - 1.0) * 0.18
        + (0.05 if days_cover < 7 else 0.0),
        0.0,
        1.0,
    )

    factors: List[str] = []
    if spike_ratio > 1.35:
        factors.append("sorties 7j superieures a la tendance 30j")
    if variability_ratio > 0.50:
        factors.append("variabilite elevee")
    if flow_ratio > 1.20:
        factors.append("sorties > entrees sur 14j")
    if trend > 0:
        factors.append("tendance haussiere")
    if not factors:
        factors.append("comportement de sortie stable")

    level = "high" if score >= 0.70 else ("medium" if score >= 0.45 else "low")
    reason = factors[0]

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "anomaly_score": round(score * 100.0, 3),
        "risk_level": level,
        "is_anomaly": bool(score >= 0.50),
        "reason": reason,
        "factors": factors,
    }


def _weak_label(row: Dict[str, Any]) -> int:
    if "target_anomaly" in row:
        return 1 if as_float(row.get("target_anomaly"), 0.0) >= 1.0 else 0

    avg30 = as_float(row.get("avg_exit_30d"), 0.0)
    future7 = as_float(row.get("target_future_exit_7d"), 0.0)
    vol30 = as_float(row.get("volatility_exit_30d"), 0.0)
    if future7 > (avg30 * 7.0 * 1.35):
        return 1
    if vol30 > (max(avg30, 0.1) * 0.60):
        return 1
    if as_float(row.get("target_stockout_j7"), 0.0) >= 1.0:
        return 1
    return 0


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "precision": 0,
            "recall": 0,
            "f1": 0,
            "accuracy": 0,
            "auc": None,
            "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0},
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    tp = fp = tn = fn = 0
    labels: List[int] = []
    scores: List[float] = []

    for row in test_rows:
        pred = predict_one(row)
        y = _weak_label(row)
        prob = safe_div(as_float(pred.get("anomaly_score"), 0.0), 100.0, 0.0)
        y_hat = 1 if bool(pred.get("is_anomaly")) else 0

        labels.append(y)
        scores.append(prob)
        if y_hat == 1 and y == 1:
            tp += 1
        elif y_hat == 1 and y == 0:
            fp += 1
        elif y_hat == 0 and y == 0:
            tn += 1
        else:
            fn += 1

    precision = safe_div(tp, tp + fp, 0.0)
    recall = safe_div(tp, tp + fn, 0.0)
    f1 = safe_div(2.0 * precision * recall, precision + recall, 0.0)
    accuracy = safe_div(tp + tn, max(1, len(test_rows)), 0.0)
    auc_value = roc_auc(labels, scores)

    metrics = {
        "n_samples": len(test_rows),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "auc": None if auc_value is None else round(auc_value, 4),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
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
        predictions.sort(key=lambda item: as_float(item.get("anomaly_score"), 0.0), reverse=True)
        result = {"predictions": predictions}

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
