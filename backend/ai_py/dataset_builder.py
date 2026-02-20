import argparse
import csv
import json
import os
from typing import Any, Dict, List


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    version_tag = str(payload.get("version_tag", "v00000000000000"))
    base_dir = str(payload.get("base_dir", "."))
    stockout_rows = payload.get("stockout_rows", [])
    consumption_rows = payload.get("consumption_rows", [])

    os.makedirs(base_dir, exist_ok=True)

    files = {
        "stockout_csv": os.path.join(base_dir, f"stockout_dataset_{version_tag}.csv"),
        "stockout_jsonl": os.path.join(base_dir, f"stockout_dataset_{version_tag}.jsonl"),
        "consumption_csv": os.path.join(base_dir, f"consumption_dataset_{version_tag}.csv"),
        "consumption_jsonl": os.path.join(base_dir, f"consumption_dataset_{version_tag}.jsonl"),
    }

    write_csv(files["stockout_csv"], stockout_rows)
    write_jsonl(files["stockout_jsonl"], stockout_rows)
    write_csv(files["consumption_csv"], consumption_rows)
    write_jsonl(files["consumption_jsonl"], consumption_rows)

    result = {
        "files": files,
        "counts": {
            "stockout_rows": len(stockout_rows),
            "consumption_rows": len(consumption_rows),
        },
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
