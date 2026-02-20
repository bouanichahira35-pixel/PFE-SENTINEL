from typing import Any, Dict, List

from _common import (
    as_float,
    clamp,
    dump_output,
    load_payload,
    parse_io_args,
    pr_auc,
    roc_auc,
    safe_div,
)


def _expected_daily(features: Dict[str, Any]) -> float:
    avg7 = as_float(features.get("avg_exit_7d"), 0.0)
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    return max(0.0, avg7 * 0.55 + avg30 * 0.35 + max(0.0, trend) * 0.10)


def _risk_components(features: Dict[str, Any], horizon_days: int) -> Dict[str, float]:
    horizon = max(1, min(30, int(horizon_days or 7)))
    stock_anchor = as_float(features.get("stock_anchor"), 0.0)
    threshold = max(0.0, as_float(features.get("seuil_minimum"), 0.0))
    avg30 = as_float(features.get("avg_exit_30d"), 0.0)
    vol30 = as_float(features.get("volatility_exit_30d"), 0.0)
    trend = as_float(features.get("trend_exit_14d"), 0.0)
    lead = max(1.0, as_float(features.get("supplier_lead_time_days"), 7.0))

    daily = _expected_daily(features)
    expected_need = daily * horizon
    projected_stock_end = stock_anchor - expected_need
    days_cover = safe_div(stock_anchor, max(daily, 0.1), 9999.0)
    cv = safe_div(vol30, max(avg30, 0.1), 0.0)

    stock_below_threshold = 1.0 if stock_anchor <= threshold else 0.0
    projected_below_threshold = 1.0 if projected_stock_end <= threshold else 0.0
    cover_pressure = clamp(safe_div(max(0.0, horizon - days_cover), max(1.0, horizon), 0.0), 0.0, 1.0)
    variability_pressure = clamp(safe_div(cv, 1.5, 0.0), 0.0, 1.0)
    trend_pressure = clamp(safe_div(max(0.0, trend), max(avg30, 0.1), 0.0), 0.0, 1.0)
    lead_pressure = 1.0 if lead >= 10 else clamp(safe_div(lead - 4.0, 10.0, 0.0), 0.0, 1.0)

    return {
        "daily": daily,
        "expected_need": expected_need,
        "projected_stock_end": projected_stock_end,
        "days_cover": days_cover,
        "stock_below_threshold": stock_below_threshold,
        "projected_below_threshold": projected_below_threshold,
        "cover_pressure": cover_pressure,
        "variability_pressure": variability_pressure,
        "trend_pressure": trend_pressure,
        "lead_pressure": lead_pressure,
        "cv": cv,
    }


def predict_one(features: Dict[str, Any], horizon_days: int = 7) -> Dict[str, Any]:
    horizon = max(1, min(30, int(horizon_days or 7)))
    components = _risk_components(features, horizon)
    threshold = max(0.0, as_float(features.get("seuil_minimum"), 0.0))
    stock_anchor = as_float(features.get("stock_anchor"), 0.0)

    score = clamp(
        components["stock_below_threshold"] * 0.30
        + components["projected_below_threshold"] * 0.22
        + components["cover_pressure"] * 0.20
        + components["variability_pressure"] * 0.15
        + components["trend_pressure"] * 0.08
        + components["lead_pressure"] * 0.05,
        0.0,
        1.0,
    )

    probability = round(score * 100.0, 3)
    level = "eleve" if score >= 0.70 else ("moyen" if score >= 0.40 else "faible")

    factors: List[str] = []
    if components["stock_below_threshold"] >= 1.0:
        factors.append("stock inferieur ou egal au seuil")
    if components["projected_below_threshold"] >= 1.0:
        factors.append("projection fin horizon sous seuil")
    if components["cover_pressure"] > 0.25:
        factors.append("couverture de stock insuffisante")
    if components["trend_pressure"] > 0.20:
        factors.append("tendance de sorties haussiere")
    if components["variability_pressure"] > 0.30:
        factors.append("consommation instable")
    if not factors:
        factors.append("profil stable et couverture acceptable")

    safety_stock = max(
        threshold,
        components["daily"] * max(7.0, as_float(features.get("supplier_lead_time_days"), 7.0)) * (0.35 + components["cv"] * 0.25),
    )
    recommended = max(0, int(round(components["expected_need"] + safety_stock - stock_anchor)))

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "risk_level": level,
        "risk_probability": probability,
        "projected_stock_end": round(components["projected_stock_end"], 3),
        "expected_need": round(components["expected_need"], 3),
        "days_cover_estimate": round(components["days_cover"], 3),
        "recommended_order_qty": recommended,
        "factors": factors,
        "current_stock": as_float(features.get("current_stock"), 0.0),
        "seuil_minimum": threshold,
        "horizon_days": horizon,
    }


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8, probability_threshold: float = 50.0) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "precision": 0,
            "recall": 0,
            "f1": 0,
            "accuracy": 0,
            "auc": None,
            "pr_auc": None,
            "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0},
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    tp = fp = tn = fn = 0
    labels: List[int] = []
    scores: List[float] = []

    for row in test_rows:
        pred = predict_one(row, 7)
        prob = safe_div(as_float(pred.get("risk_probability"), 0.0), 100.0, 0.0)
        y = int(as_float(row.get("target_stockout_j7"), 0.0) >= 1.0)
        y_hat = 1 if as_float(pred.get("risk_probability"), 0.0) >= probability_threshold else 0

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
    pr_auc_value = pr_auc(labels, scores)

    metrics = {
        "n_samples": len(test_rows),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "auc": None if auc_value is None else round(auc_value, 4),
        "pr_auc": None if pr_auc_value is None else round(pr_auc_value, 4),
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
            probability_threshold=as_float(payload.get("probability_threshold"), 50.0),
        )
    else:
        horizon_days = int(payload.get("horizon_days", 7) or 7)
        items = payload.get("items", [])
        predictions = [predict_one(item, horizon_days) for item in items]
        predictions.sort(key=lambda item: as_float(item.get("risk_probability"), 0.0), reverse=True)
        result = {"predictions": predictions}

    dump_output(output_path, result)


if __name__ == "__main__":
    main()
