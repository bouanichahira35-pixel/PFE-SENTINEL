import argparse
import json
import math
from typing import Any, Dict, List


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    if b == 0:
        return fallback
    return a / b


def predict_one(features: Dict[str, Any], horizon_days: int) -> Dict[str, Any]:
    horizon = max(1, min(30, int(horizon_days or 14)))
    avg7 = float(features.get("avg_exit_7d", 0) or 0)
    avg30 = float(features.get("avg_exit_30d", 0) or 0)
    trend = float(features.get("trend_exit_14d", 0) or 0)
    vol30 = float(features.get("volatility_exit_30d", 0) or 0)
    weighted_daily = max(0.0, avg7 * 0.55 + avg30 * 0.35 + max(0.0, trend) * 0.1)
    expected = max(0.0, weighted_daily * horizon)
    confidence = clamp(0.5 + min(0.25, avg30 / 100.0) - min(0.2, vol30 / 100.0), 0.35, 0.95)
    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "horizon_days": horizon,
        "expected_quantity": round(expected, 2),
        "expected_daily": round(weighted_daily, 4),
        "confidence_score": round(confidence, 2),
        "current_stock": float(features.get("current_stock", 0) or 0),
        "avg_exit_7d": avg7,
        "avg_exit_30d": avg30,
        "trend_exit_14d": trend,
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {"n_samples": 0, "mae": 0, "mape": 0, "rmse": 0, "worst_products_by_mae": []}
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows
    abs_err = 0.0
    sq_err = 0.0
    mape_sum = 0.0
    mape_count = 0
    per_product: Dict[str, Dict[str, float]] = {}

    for row in test_rows:
        pred = predict_one(row, 14)
        y_hat = float(pred["expected_quantity"])
        y = float(row.get("target_consommation_14d", 0) or 0)
        err = y_hat - y
        abs_err += abs(err)
        sq_err += err * err
        if y > 0:
            mape_sum += abs(err / y)
            mape_count += 1
        pid = str(row.get("product_id", ""))
        if pid:
            if pid not in per_product:
                per_product[pid] = {"n": 0, "abs": 0.0}
            per_product[pid]["n"] += 1
            per_product[pid]["abs"] += abs(err)

    worst = sorted(
        [{"product_id": pid, "mae": round(v["abs"] / max(1, v["n"]), 3), "n": int(v["n"])} for pid, v in per_product.items()],
        key=lambda x: x["mae"],
        reverse=True,
    )[:10]
    metrics = {
        "n_samples": len(test_rows),
        "mae": round(abs_err / len(test_rows), 4),
        "mape": round(safe_div(mape_sum, max(1, mape_count), 0.0) * 100.0, 4),
        "rmse": round(math.sqrt(sq_err / len(test_rows)), 4),
        "worst_products_by_mae": worst,
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
        horizon_days = int(payload.get("horizon_days", 14) or 14)
        items = payload.get("items", [])
        predictions = [predict_one(item, horizon_days) for item in items]
        predictions.sort(key=lambda x: float(x.get("expected_quantity", 0)), reverse=True)
        result = {"predictions": predictions}

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
