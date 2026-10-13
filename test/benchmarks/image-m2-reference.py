#!/usr/bin/env python3
"""Reference SSIMULACRA2 comparison for matched display-size evidence.

This benchmark does not imply pixel-level losslessness or an automatic quality
percentage. The browser uses MILO for candidate search; SSIMULACRA2 is an
independent CI metric for review and correlation.
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

def score(reference: Path, candidate: Path) -> float:
    process = subprocess.run(
        ["ssimulacra2_rs", "image", str(reference), str(candidate)],
        text=True, capture_output=True, check=True, timeout=45
    )
    output = (process.stdout + "\n" + process.stderr).strip()
    found = re.findall(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?", output)
    if not found:
        raise RuntimeError(f"Unparseable SSIMULACRA2 output: {output[:400]}")
    value = float(found[-1])
    if not math.isfinite(value) or value > 100.01:
        raise RuntimeError(f"Invalid SSIMULACRA2 score: {value}")
    return value

def run(root: Path) -> dict:
    report = {"metric": "SSIMULACRA2 reference via ssimulacra2_rs 0.5.2",
              "comparison": "Same normalized display dimensions (long side 256px)",
              "samples": [], "summary": {}}
    for folder in sorted(root.glob("image-m2-*")):
        evidence = folder / "reference"
        for original in sorted(evidence.glob("*-original.png")):
            stem = original.name.removesuffix("-original.png")
            baseline = evidence / f"{stem}-baseline.png"
            improved = evidence / f"{stem}-optimized.png"
            if not baseline.exists() or not improved.exists():
                raise FileNotFoundError(f"Missing evidence pair: {stem} in {evidence}")
            baseline_score = score(original, baseline)
            improved_score = score(original, improved)
            report["samples"].append({
                "fixture": folder.name, "sample": stem,
                "baselineScore": baseline_score, "optimizedScore": improved_score,
                "delta": round(improved_score - baseline_score, 4),
            })
    samples = report["samples"]
    if not samples:
        raise RuntimeError("No perceptual improvement evidence was produced.")
    deltas = [s["delta"] for s in samples]
    report["summary"] = {
        "sampleCount": len(samples),
        "meanDelta": round(sum(deltas) / len(deltas), 4),
        "referenceImproved": sum(1 for x in deltas if x > 0),
        "referenceRegressed": sum(1 for x in deltas if x < 0),
        "severeRegressionsOver5Points": sum(1 for x in deltas if x < -5),
        "minDelta": min(deltas), "maxDelta": max(deltas)
    }
    return report

if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("m2-artifacts")
    report = run(root)
    destination = Path("m2-reference-report.json")
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))
    # A perceptual score comparison is advisory while we calibrate MILO
    # against this reference and human visual review.
