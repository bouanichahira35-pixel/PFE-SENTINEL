import argparse
import json
from typing import Any, Dict, List


def safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    if b == 0:
        return fallback
    return a / b


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def predict_one(features: Dict[str, Any]) -> Dict[str, Any]:
    avg7 = float(features.get("avg_exit_7d", 0) or 0)
    avg30 = float(features.get("avg_exit_30d", 0) or 0)
    vol30 = float(features.get("volatility_exit_30d", 0) or 0)
    trend = float(features.get("trend_exit_14d", 0) or 0)
    entries14 = float(features.get("entries_14d", 0) or 0)
    exits14 = float(features.get("exits_14d", 0) or 0)
    stock_anchor = float(features.get("stock_anchor", 0) or 0)
    days_cover = float(features.get("days_cover_estimate", 0) or 0)

    # Heuristic anomaly score centered on sudden consumption elevation + volatility.
    base_ratio = safe_div(avg7, max(avg30, 0.1), 1.0)
    vol_ratio = safe_div(vol30, max(avg30, 0.1), 0.0)
    flow_ratio = safe_div(exits14, max(entries14, 0.1), 0.0)
    score = clamp(
        (base_ratio - 1.0) * 0.45
        + max(0.0, trend) * 0.10
        + vol_ratio * 0.25
        + max(0.0, flow_ratio - 1.0) * 0.15
        + (0.10 if days_cover < 7 else 0.0)
        + (0.05 if stock_anchor <= 0 else 0.0),
        0.0,
        1.0,
    )

    level = "high" if score >= 0.7 else ("medium" if score >= 0.4 else "low")
    factors: List[str] = []
    if base_ratio > 1.3:
        factors.append("sorties 7j > tendance 30j")
    if vol_ratio > 0.5:
        factors.append("volatilite elevee")
    if flow_ratio > 1.2:
        factors.append("sorties > entrees sur 14j")
    if trend > 0:
        factors.append("tendance de consommation haussiere")
    if days_cover < 7:
        factors.append("couverture stock courte")
    if not factors:
        factors.append("comportement stable")

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "anomaly_score": round(score * 100.0, 2),
        "risk_level": level,
        "is_anomaly": score >= 0.5,
        "factors": factors,
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "precision": 0,
            "recall": 0,
            "f1": 0,
            "accuracy": 0,
            "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0},
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    tp = fp = tn = fn = 0
    for row in test_rows:
      # Weak supervision label: sudden future exits relative to baseline.
        baseline = float(row.get("avg_exit_30d", 0) or 0)
        future7 = float(row.get("target_future_exit_7d", 0) or 0)
        label = 1 if future7 > (baseline * 7 * 1.35) else 0
        pred = predict_one(row)
        y_hat = 1 if pred["is_anomaly"] else 0
        if y_hat == 1 and label == 1:
            tp += 1
        elif y_hat == 1 and label == 0:
            fp += 1
        elif y_hat == 0 and label == 0:
            tn += 1
        else:
            fn += 1

    precision = safe_div(tp, tp + fp, 0.0)
    recall = safe_div(tp, tp + fn, 0.0)
    f1 = safe_div(2 * precision * recall, precision + recall, 0.0)
    accuracy = safe_div(tp + tn, max(1, len(test_rows)), 0.0)
    metrics = {
        "n_samples": len(test_rows),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
    }
    return {
        "metrics": metrics,
        "backtesting": {"train_samples": idx, "test_samples": len(test_rows), "test_metrics": metrics},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    mode = payload.get("mode", "predict")
    if mode == "evaluate":
        result = evaluate_rows(payload.get("rows", []), payload.get("split_ratio", 0.8))
    else:
        items = payload.get("items", [])
        predictions = [predict_one(item) for item in items]
        predictions.sort(key=lambda x: float(x.get("anomaly_score", 0)), reverse=True)
        result = {"predictions": predictions}

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
