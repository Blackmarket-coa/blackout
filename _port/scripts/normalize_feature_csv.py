#!/usr/bin/env python3
"""Normalize a pasted feature CSV backlog.

Handles common paste issues:
- literal "\\n" separators instead of real newlines
- repeated header blocks
- duplicated feature rows
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from collections import OrderedDict


def normalize_raw_text(raw: str) -> str:
    text = raw.strip()
    if "\\n" in text and "\n" not in text.replace("\\n", ""):
        text = text.replace("\\n", "\n")
    else:
        text = text.replace("\\n", "\n")
    return text.strip() + "\n"


def parse_csv(text: str) -> tuple[list[str], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("Unable to find a CSV header row.")

    fieldnames = [field.strip() for field in reader.fieldnames]
    rows: list[dict[str, str]] = []
    for row in reader:
        cleaned = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        # Skip accidental repeated header rows.
        if cleaned.get("feature_id") == "feature_id":
            continue
        if not any(cleaned.values()):
            continue
        rows.append(cleaned)
    return fieldnames, rows


def dedupe_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    by_feature_id: "OrderedDict[str, dict[str, str]]" = OrderedDict()
    for row in rows:
        feature_id = row.get("feature_id", "")
        if not feature_id:
            feature_id = f"__row_{len(by_feature_id)}"
        if feature_id not in by_feature_id:
            by_feature_id[feature_id] = row
    return list(by_feature_id.values())


def write_csv(fieldnames: list[str], rows: list[dict[str, str]], out: io.TextIOBase) -> None:
    writer = csv.DictWriter(out, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({name: row.get(name, "") for name in fieldnames})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", default="-", help="Input CSV file (default: stdin)")
    parser.add_argument("-o", "--output", default="-", help="Output CSV file (default: stdout)")
    args = parser.parse_args()

    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    normalized_text = normalize_raw_text(raw)
    fieldnames, rows = parse_csv(normalized_text)
    deduped_rows = dedupe_rows(rows)

    if args.output == "-":
        write_csv(fieldnames, deduped_rows, sys.stdout)
    else:
        with open(args.output, "w", encoding="utf-8", newline="") as handle:
            write_csv(fieldnames, deduped_rows, handle)

    removed = len(rows) - len(deduped_rows)
    print(
        f"Normalized {len(rows)} rows -> {len(deduped_rows)} rows (removed {removed} duplicates).",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
