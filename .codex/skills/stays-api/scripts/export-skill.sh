#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-stays-api-skill.zip}"

case "$OUTPUT" in
  /*) ;;
  *) OUTPUT="$PWD/$OUTPUT" ;;
esac

mkdir -p "$(dirname -- "$OUTPUT")"
python3 - "$SCRIPT_DIR" "$OUTPUT" <<'PY'
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import sys

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
required = [
    "README.md",
    "SKILL.md",
    ".env.example",
    ".gitignore",
    "agents/openai.yaml",
    "references/api-guide.md",
    "references/api-map.md",
    "references/operation-workflow.md",
    "references/booking-operations.md",
    "references/request-patterns.md",
    "references/side-effects.md",
    "references/troubleshooting.md",
    "references/refresh-openapi.md",
    "references/reservations-and-guests.md",
    "references/listings-and-inventory.md",
    "references/calendar-and-pricing.md",
    "references/finance-and-reconciliation.md",
    "references/communications-and-operations.md",
    "references/intent-router.md",
    "references/stays-capabilities.md",
    "references/listing-lifecycle.md",
    "references/endpoint-catalog.md",
    "references/stays-openapi.json",
    "scripts/inspect-openapi.py",
    "scripts/build-endpoint-catalog.py",
]
missing = [name for name in required if not (root / name).is_file()]
if missing:
    raise SystemExit("Missing required skill files: " + ", ".join(missing))

with ZipFile(out, "w", ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(root)
        if any(part in {".git", "__pycache__", "node_modules"} for part in rel.parts):
            continue
        if path == out or path.name == ".DS_Store":
            continue
        if path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example"):
            continue
        zf.write(path, Path("stays-api") / rel)

with ZipFile(out) as zf:
    names = set(zf.namelist())
    missing = [f"stays-api/{name}" for name in required if f"stays-api/{name}" not in names]
    if missing:
        raise SystemExit("Export verification failed: " + ", ".join(missing))
    forbidden = [name for name in names if name.endswith("/.env") or "/.env." in name and not name.endswith("/.env.example") or ".DS_Store" in name]
    if forbidden:
        raise SystemExit("Export contains local-only files: " + ", ".join(forbidden))
print(f"Exported {len(names)} files to {out}")
PY
