import argparse
import csv
import json
import math
from typing import Any, Dict, Iterable, List, Optional, Tuple


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    if b == 0:
        return fallback
    return a / b


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def as_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def mean(values: Iterable[float]) -> float:
    values_list = [float(v or 0) for v in values]
    if not values_list:
        return 0.0
    return sum(values_list) / len(values_list)


def std(values: Iterable[float], avg: Optional[float] = None) -> float:
    values_list = [float(v or 0) for v in values]
    if not values_list:
        return 0.0
    m = float(avg) if avg is not None else mean(values_list)
    variance = sum((v - m) ** 2 for v in values_list) / len(values_list)
    return math.sqrt(variance)


def write_csv(file_path: str, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            f.write("")
        return
    headers = list(rows[0].keys())
    with open(file_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def write_jsonl(file_path: str, rows: List[Dict[str, Any]]) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=True))
            f.write("\n")


def parse_io_args() -> Tuple[str, str]:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    return args.input, args.output


def load_payload(input_path: str) -> Dict[str, Any]:
    with open(input_path, "r", encoding="utf-8") as f:
        return json.load(f)


def dump_output(output_path: str, payload: Dict[str, Any]) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True)


def roc_auc(labels: List[int], scores: List[float]) -> Optional[float]:
    if not labels or len(labels) != len(scores):
        return None
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


def pr_auc(labels: List[int], scores: List[float]) -> Optional[float]:
    if not labels or len(labels) != len(scores):
        return None
    order = sorted(range(len(scores)), key=lambda idx: scores[idx], reverse=True)
    total_pos = sum(1 for y in labels if y == 1)
    if total_pos == 0:
        return None

    tp = 0
    fp = 0
    prev_recall = 0.0
    auc = 0.0

    for idx in order:
        y = labels[idx]
        if y == 1:
            tp += 1
        else:
            fp += 1

        precision = safe_div(tp, tp + fp, 0.0)
        recall = safe_div(tp, total_pos, 0.0)
        auc += precision * max(0.0, recall - prev_recall)
        prev_recall = recall

    return auc
