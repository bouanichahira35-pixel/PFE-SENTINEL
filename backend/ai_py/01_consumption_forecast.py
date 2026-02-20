import math
from typing import Any, Dict, List

from _common import as_float, clamp, dump_output, load_payload, parse_io_args, safe_div


def _daily_signal(features: Dict[str, Any]) -> float:
    avg7 = as_float(features.get("avg_exit_7d"), 0.0)
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    return max(0.0, avg7 * 0.55 + avg30 * 0.35 + max(0.0, trend) * 0.10)


def predict_one(features: Dict[str, Any], horizon_days: int = 14) -> Dict[str, Any]:
    horizon = max(1, min(30, int(horizon_days or 14)))
    daily = _daily_signal(features)
    vol30 = as_float(features.get("volatility_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)

    expected = max(0.0, daily * horizon)
    spread = max(1.0, (vol30 + abs(trend) * 0.30) * max(1.0, horizon / 7.0))
    low = max(0.0, expected - spread)
    high = expected + spread
    confidence = clamp(1.0 - safe_div(spread, expected + 1.0, 0.0), 0.35, 0.97)

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "horizon_days": horizon,
        "expected_quantity": round(expected, 3),
        "expected_daily": round(daily, 6),
        "prediction_interval_low": round(low, 3),
        "prediction_interval_high": round(high, 3),
        "confidence_score": round(confidence, 4),
        "pred_qty_j7": round(daily * 7.0, 3),
        "pred_qty_j14": round(daily * 14.0, 3),
        "current_stock": as_float(features.get("current_stock"), 0.0),
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8, horizon_days: int = 14) -> Dict[str, Any]:
    if not rows:
        empty = {"n_samples": 0, "mae": 0, "mape": 0, "rmse": 0, "worst_products_by_mae": []}
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows
    target_key = "target_consommation_14d" if int(horizon_days or 14) >= 14 else "target_consommation_7d"

    abs_err = 0.0
    sq_err = 0.0
    mape_sum = 0.0
    mape_count = 0
    per_product: Dict[str, Dict[str, float]] = {}

    for row in test_rows:
        pred = predict_one(row, horizon_days)
        y_hat = as_float(pred.get("expected_quantity"), 0.0)
        y = as_float(row.get(target_key), 0.0)
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
        [
            {"product_id": pid, "mae": round(data["abs"] / max(1, data["n"]), 4), "n": int(data["n"])}
            for pid, data in per_product.items()
        ],
        key=lambda item: item["mae"],
        reverse=True,
    )[:10]

    metrics = {
        "n_samples": len(test_rows),
        "mae": round(abs_err / max(1, len(test_rows)), 4),
        "mape": round(safe_div(mape_sum, max(1, mape_count), 0.0) * 100.0, 4),
        "rmse": round(math.sqrt(sq_err / max(1, len(test_rows))), 4),
        "worst_products_by_mae": worst,
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
            horizon_days=int(payload.get("horizon_days", 14) or 14),
        )
    else:
        horizon_days = int(payload.get("horizon_days", 14) or 14)
        items = payload.get("items", [])
        predictions = [predict_one(item, horizon_days) for item in items]
        predictions.sort(key=lambda item: as_float(item.get("expected_quantity"), 0.0), reverse=True)
        result = {"predictions": predictions}

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
