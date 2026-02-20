import os
from typing import Any, Dict, List

from _common import (
    as_float,
    clamp,
    dump_output,
    load_payload,
    parse_io_args,
    safe_div,
    write_csv,
    write_jsonl,
)


def enrich_row(row: Dict[str, Any]) -> Dict[str, Any]:
    avg7 = as_float(row.get("avg_exit_7d"), 0.0)
    avg30 = as_float(row.get("avg_exit_30d"), 0.0)
    vol30 = as_float(row.get("volatility_exit_30d"), 0.0)
    trend14 = as_float(row.get("trend_exit_14d"), 0.0)
    entries14 = as_float(row.get("entries_14d"), 0.0)
    exits14 = as_float(row.get("exits_14d"), 0.0)
    stock_anchor = as_float(row.get("stock_anchor"), 0.0)
    threshold = max(1.0, as_float(row.get("seuil_minimum"), 0.0))
    lead_days = max(1.0, as_float(row.get("supplier_lead_time_days"), 7.0))
    days_cover = as_float(row.get("days_cover_estimate"), 0.0)

    cv = safe_div(vol30, max(avg30, 0.1), 0.0)
    stability_index = cv
    flow_balance_14d = entries14 - exits14
    rotation_rate_14d = safe_div(exits14, max(stock_anchor + entries14, 1.0), 0.0)
    trend_ratio_14d = safe_div(max(trend14, 0.0), max(avg30, 0.1), 0.0)

    stock_risk = clamp(1.0 - safe_div(stock_anchor, threshold * 2.5, 1.0), 0.0, 1.0)
    cover_risk = clamp(safe_div(max(0.0, 10.0 - days_cover), 10.0, 0.0), 0.0, 1.0)
    variability_risk = clamp(safe_div(cv, 1.5, 0.0), 0.0, 1.0)
    criticality_seed = round((0.45 * stock_risk + 0.30 * cover_risk + 0.25 * variability_risk) * 100.0, 3)

    avg_daily = max(0.0, avg7 * 0.6 + avg30 * 0.4)
    dynamic_margin = avg_daily * max(2.0, lead_days * 0.6) * (1.0 + min(cv, 1.5))
    formula_threshold = avg_daily * lead_days + dynamic_margin
    threshold_gap = formula_threshold - as_float(row.get("seuil_minimum"), 0.0)

    return {
        **row,
        "behavior_stability_index": round(stability_index, 6),
        "consumption_cv_30d": round(cv, 6),
        "trend_ratio_14d": round(trend_ratio_14d, 6),
        "flow_balance_14d": round(flow_balance_14d, 6),
        "rotation_rate_14d": round(rotation_rate_14d, 6),
        "criticality_seed_score": criticality_seed,
        "formula_recommended_threshold": round(formula_threshold, 4),
        "formula_safety_stock": round(dynamic_margin, 4),
        "formula_threshold_gap": round(threshold_gap, 4),
    }


def build_anomaly_rows(stockout_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for row in stockout_rows:
        avg30 = as_float(row.get("avg_exit_30d"), 0.0)
        vol30 = as_float(row.get("volatility_exit_30d"), 0.0)
        future7 = as_float(row.get("target_future_exit_7d"), 0.0)
        rupture7 = int(as_float(row.get("target_stockout_j7"), 0.0) >= 1.0)
        weak_label = 1 if (
            future7 > (avg30 * 7.0 * 1.35)
            or vol30 > (max(avg30, 0.1) * 0.60)
            or rupture7 == 1
        ) else 0
        rows.append({
            **row,
            "target_anomaly": weak_label,
        })
    return rows


def build_adaptive_rows(stockout_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for row in stockout_rows:
        threshold = as_float(row.get("seuil_minimum"), 0.0)
        recommended = as_float(row.get("formula_recommended_threshold"), threshold)
        gap = recommended - threshold
        breach = int(as_float(row.get("target_stockout_j7"), 0.0) >= 1.0)
        rows.append({
            **row,
            "recommended_threshold": round(recommended, 4),
            "safety_stock": round(as_float(row.get("formula_safety_stock"), 0.0), 4),
            "threshold_gap": round(gap, 4),
            "target_threshold_breach": breach,
        })
    return rows


def main() -> None:
    input_path, output_path = parse_io_args()
    payload = load_payload(input_path)

    version_tag = str(payload.get("version_tag", "v00000000000000"))
    base_dir = str(payload.get("base_dir", "."))
    stockout_rows_in = payload.get("stockout_rows", [])
    consumption_rows_in = payload.get("consumption_rows", [])

    stockout_rows = [enrich_row(row) for row in stockout_rows_in]
    consumption_rows = [enrich_row(row) for row in consumption_rows_in]
    anomaly_rows = build_anomaly_rows(stockout_rows)
    adaptive_rows = build_adaptive_rows(stockout_rows)

    os.makedirs(base_dir, exist_ok=True)
    files = {
        "stockout_csv": os.path.join(base_dir, f"stockout_dataset_{version_tag}.csv"),
        "stockout_jsonl": os.path.join(base_dir, f"stockout_dataset_{version_tag}.jsonl"),
        "consumption_csv": os.path.join(base_dir, f"consumption_dataset_{version_tag}.csv"),
        "consumption_jsonl": os.path.join(base_dir, f"consumption_dataset_{version_tag}.jsonl"),
        "adaptive_csv": os.path.join(base_dir, f"adaptive_features_{version_tag}.csv"),
        "adaptive_jsonl": os.path.join(base_dir, f"adaptive_features_{version_tag}.jsonl"),
        "anomaly_csv": os.path.join(base_dir, f"anomaly_dataset_{version_tag}.csv"),
        "anomaly_jsonl": os.path.join(base_dir, f"anomaly_dataset_{version_tag}.jsonl"),
    }

    write_csv(files["stockout_csv"], stockout_rows)
    write_jsonl(files["stockout_jsonl"], stockout_rows)
    write_csv(files["consumption_csv"], consumption_rows)
    write_jsonl(files["consumption_jsonl"], consumption_rows)
    write_csv(files["adaptive_csv"], adaptive_rows)
    write_jsonl(files["adaptive_jsonl"], adaptive_rows)
    write_csv(files["anomaly_csv"], anomaly_rows)
    write_jsonl(files["anomaly_jsonl"], anomaly_rows)

    real_stockout = sum(1 for row in stockout_rows if str(row.get("data_source", "")).lower() == "real")
    real_consumption = sum(1 for row in consumption_rows if str(row.get("data_source", "")).lower() == "real")

    result = {
        "files": files,
        "counts": {
            "stockout_rows": len(stockout_rows),
            "consumption_rows": len(consumption_rows),
            "adaptive_rows": len(adaptive_rows),
            "anomaly_rows": len(anomaly_rows),
        },
        "quality": {
            "real_ratio_stockout": round(safe_div(real_stockout, max(1, len(stockout_rows)), 0.0), 4),
            "real_ratio_consumption": round(safe_div(real_consumption, max(1, len(consumption_rows)), 0.0), 4),
            "recommendation": (
                "Collecter plus de mouvements reels pour fiabiliser le moteur adaptatif."
                if (real_stockout < 200 or real_consumption < 200)
                else "Qualite data acceptable pour entrainement."
            ),
        },
        "rows": {
            "stockout_rows": stockout_rows,
            "consumption_rows": consumption_rows,
            "adaptive_rows": adaptive_rows,
            "anomaly_rows": anomaly_rows,
        },
    }
    dump_output(output_path, result)


if __name__ == "__main__":
    main()
