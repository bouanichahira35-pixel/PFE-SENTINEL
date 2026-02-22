import argparse
import json
import os
import subprocess
import tempfile
from typing import Any, Dict, Tuple


def run_step(script_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    base_dir = os.path.dirname(__file__)
    script_path = os.path.join(base_dir, script_name)
    python_bin = os.getenv("AI_PYTHON_BIN", "python")
    fd_in, input_path = tempfile.mkstemp(prefix=f"{script_name}_", suffix="_in.json")
    fd_out, output_path = tempfile.mkstemp(prefix=f"{script_name}_", suffix="_out.json")
    os.close(fd_in)
    os.close(fd_out)
    try:
        with open(input_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=True)
        proc = subprocess.run(
            [python_bin, script_path, "--input", input_path, "--output", output_path],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr or proc.stdout or f"Step failed: {script_name}")
        with open(output_path, "r", encoding="utf-8") as f:
            return json.load(f)
    finally:
        try:
            os.remove(input_path)
        except OSError:
            pass
        try:
            os.remove(output_path)
        except OSError:
            pass


def parse_args() -> Tuple[str, str]:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    return args.input, args.output


def main() -> None:
    input_path, output_path = parse_args()
    with open(input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    build = run_step("00_build_features.py", payload)
    rows = build.get("rows", {})

    stockout_eval = run_step("02_stockout_risk_classifier.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("stockout_rows", []),
    })
    consumption_eval = run_step("01_consumption_forecast.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("consumption_rows", []),
    })
    anomaly_eval = run_step("03_anomaly_detector.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("anomaly_rows", []),
    })
    adaptive_eval = run_step("04_adaptive_threshold_model.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("adaptive_rows", []),
    })
    behavioral_eval = run_step("05_behavioral_classification.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("adaptive_rows", []),
    })
    intelligence_eval = run_step("06_operational_intelligence_score.py", {
        "mode": "evaluate",
        "split_ratio": payload.get("split_ratio", 0.8),
        "rows": rows.get("adaptive_rows", []),
    })

    result = {
        "files": build.get("files", {}),
        "counts": build.get("counts", {}),
        "quality": build.get("quality", {}),
        "metrics": {
            "stockout_j7": stockout_eval.get("metrics", {}),
            "consumption_j14": consumption_eval.get("metrics", {}),
            "anomaly_detection": anomaly_eval.get("metrics", {}),
            "adaptive_threshold": adaptive_eval.get("metrics", {}),
            "behavioral_classification": behavioral_eval.get("metrics", {}),
            "operational_intelligence": intelligence_eval.get("metrics", {}),
        },
        "backtesting": {
            "stockout_j7": stockout_eval.get("backtesting", {}),
            "consumption_j14": consumption_eval.get("backtesting", {}),
            "anomaly_detection": anomaly_eval.get("backtesting", {}),
            "adaptive_threshold": adaptive_eval.get("backtesting", {}),
            "behavioral_classification": behavioral_eval.get("backtesting", {}),
            "operational_intelligence": intelligence_eval.get("backtesting", {}),
        },
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
