"""
Merge all per-state congressional district GeoJSON files into a single national file.

Usage (from the repo root):
    python backend/scripts/merge_districts.py

Output:
    frontend/public/data/national_districts.json
"""

import json
import pathlib

DISTRICT_DATA_DIR = pathlib.Path(__file__).parent.parent / "representatives" / "district_data"
OUTPUT_PATH = pathlib.Path(__file__).parent.parent.parent / "frontend" / "public" / "data" / "national_districts.json"


def main() -> None:
    all_features: list[dict] = []

    state_files = sorted(DISTRICT_DATA_DIR.glob("*.json"))
    if not state_files:
        raise FileNotFoundError(f"No .json files found in {DISTRICT_DATA_DIR}")

    for path in state_files:
        state_abbr = path.stem  # filename without extension, e.g. "CA"
        with path.open(encoding="utf-8") as f:
            fc = json.load(f)

        features = fc.get("features", [])
        for feature in features:
            props = feature.setdefault("properties", {})
            props["state_abbr"] = state_abbr

        all_features.extend(features)
        print(f"  {state_abbr}: {len(features)} features")

    national_fc = {"type": "FeatureCollection", "features": all_features}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(national_fc, f, separators=(",", ":"))

    size_mb = OUTPUT_PATH.stat().st_size / 1_048_576
    print(f"\nWrote {len(all_features)} features to {OUTPUT_PATH}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
