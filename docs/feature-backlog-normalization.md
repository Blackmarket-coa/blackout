# Feature backlog CSV normalization

Use `scripts/normalize_feature_csv.py` to clean pasted backlog CSV content that may include:

- Literal `\n` newline sequences.
- Repeated header blocks.
- Duplicate `feature_id` rows.

## Usage

```bash
python3 scripts/normalize_feature_csv.py raw_backlog.csv -o normalized_backlog.csv
```

or from stdin:

```bash
pbpaste | python3 scripts/normalize_feature_csv.py - -o normalized_backlog.csv
```

The script reports dedupe counts on stderr and writes a clean CSV suitable for planning imports.
