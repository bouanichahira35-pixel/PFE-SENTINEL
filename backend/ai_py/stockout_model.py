import argparse
import json
from typing import Any, Dict, List


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    if b == 0:
        return fallback
    return a / b


def consumption_daily(features: Dict[str, Any]) -> float:
    avg7 = float(features.get("avg_exit_7d", 0) or 0)
    avg30 = float(features.get("avg_exit_30d", 0) or 0)
    trend = float(features.get("trend_exit_14d", 0) or 0)
    return max(0.0, avg7 * 0.55 + avg30 * 0.35 + max(0.0, trend) * 0.1)


def predict_one(features: Dict[str, Any], horizon_days: int) -> Dict[str, Any]:
    horizon = max(1, min(30, int(horizon_days or 7)))
    stock_anchor = float(features.get("stock_anchor", 0) or 0)
    seuil = float(features.get("seuil_minimum", 0) or 0)
    trend = float(features.get("trend_exit_14d", 0) or 0)
    avg30 = float(features.get("avg_exit_30d", 0) or 0)
    vol30 = float(features.get("volatility_exit_30d", 0) or 0)
    days_since_last_entry = float(features.get("days_since_last_entry", 0) or 0)

    expected_daily = consumption_daily(features)
    expected_need = expected_daily * horizon
    projected_stock = stock_anchor - expected_need
    days_cover = safe_div(stock_anchor, max(expected_daily, 0.1), 9999.0)

    score = clamp(
        (0.35 if stock_anchor <= seuil else 0.0)
        + (0.25 if days_cover < horizon else 0.0)
        + clamp(safe_div(trend, max(avg30, 1.0), 0.0), 0.0, 0.2)
        + clamp(safe_div(vol30, max(avg30, 1.0), 0.0), 0.0, 0.15)
        + (0.05 if days_since_last_entry > 21 else 0.0)
        + (0.25 if projected_stock <= 0 else 0.0),
        0.0,
        1.0,
    )
    probability = round(score * 100, 2)
    level = "eleve" if score >= 0.7 else ("moyen" if score >= 0.4 else "faible")

    factors: List[str] = []
    if stock_anchor <= seuil:
        factors.append("stock <= seuil minimum")
    if days_cover < 7:
        factors.append("couverture stock < 7 jours")
    if trend > 0:
        factors.append("hausse des sorties recente")
    if days_since_last_entry > 21:
        factors.append("aucune entree recente")
    if not factors:
        factors.append("consommation stable et couverture correcte")

    safety_stock = max(seuil, expected_daily * 7)
    recommended = max(0, int(round(expected_need + safety_stock - stock_anchor + 0.4999)))

    return {
        "product_id": features.get("product_id"),
        "code_product": features.get("product_code"),
        "product_name": features.get("product_name"),
        "risk_level": level,
        "risk_probability": probability,
        "projected_stock_end": round(projected_stock, 2),
        "expected_need": round(expected_need, 2),
        "days_cover_estimate": round(days_cover, 2),
        "recommended_order_qty": recommended,
        "factors": factors,
        "current_stock": float(features.get("current_stock", 0) or 0),
        "seuil_minimum": seuil,
        "horizon_days": horizon,
    }


def roc_auc(labels: List[int], scores: List[float]):
    pairs = sorted(zip(labels, scores), key=lambda x: x[1])
    n_pos = sum(1 for y, _ in pairs if y == 1)
    n_neg = len(pairs) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None
    rank = 1
    i = 0
    rank_sum_pos = 0.0
    while i < len(pairs):
        j = i + 1
        while j < len(pairs) and pairs[j][1] == pairs[i][1]:
            j += 1
        avg_rank = (rank + (rank + (j - i) - 1)) / 2.0
        for k in range(i, j):
            if pairs[k][0] == 1:
                rank_sum_pos += avg_rank
        rank += (j - i)
        i = j
    return (rank_sum_pos - (n_pos * (n_pos + 1)) / 2.0) / (n_pos * n_neg)


def evaluate_rows(rows: List[Dict[str, Any]], split_ratio: float = 0.8) -> Dict[str, Any]:
    if not rows:
        empty = {
            "n_samples": 0,
            "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0},
            "precision": 0,
            "recall": 0,
            "f1": 0,
            "accuracy": 0,
            "auc": None,
        }
        return {"metrics": empty, "backtesting": {"train_samples": 0, "test_samples": 0, "test_metrics": empty}}

    idx = max(1, min(len(rows) - 1, int(len(rows) * float(split_ratio))))
    test_rows = rows[idx:] if idx < len(rows) else rows

    tp = fp = tn = fn = 0
    labels = []
    scores = []
    for row in test_rows:
        pred = predict_one(row, 7)
        score = float(pred["risk_probability"]) / 100.0
        y = int(row.get("target_stockout_j7", 0) or 0)
        y_hat = 1 if score >= 0.5 else 0
        labels.append(y)
        scores.append(score)
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
    f1 = safe_div(2 * precision * recall, precision + recall, 0.0)
    acc = safe_div(tp + tn, max(1, len(test_rows)), 0.0)
    auc = roc_auc(labels, scores)
    metrics = {
        "n_samples": len(test_rows),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(acc, 4),
        "auc": None if auc is None else round(auc, 4),
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
        horizon_days = int(payload.get("horizon_days", 7) or 7)
        items = payload.get("items", [])
        predictions = [predict_one(item, horizon_days) for item in items]
        predictions.sort(key=lambda x: float(x.get("risk_probability", 0)), reverse=True)
        result = {"predictions": predictions}

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
