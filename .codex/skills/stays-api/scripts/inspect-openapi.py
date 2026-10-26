#!/usr/bin/env python3
"""Search and inspect operations in the skill's local Stays OpenAPI snapshot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
DEFAULT_SPEC = Path(__file__).resolve().parents[1] / "references" / "stays-openapi.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="+", help="Words to match in path, summary, tags, or operationId")
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC, help="OpenAPI JSON file (defaults to the bundled snapshot)")
    parser.add_argument("--limit", type=int, default=30, help="Maximum operations to print (default: 30)")
    args = parser.parse_args()

    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Cannot read OpenAPI file: {exc}", file=sys.stderr)
        return 2

    terms = [term.casefold() for term in args.query]
    matches: list[tuple[str, str, dict]] = []
    for path, path_item in spec.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.casefold() not in HTTP_METHODS or not isinstance(operation, dict):
                continue
            haystack = " ".join(
                [path, str(operation.get("summary", "")), str(operation.get("operationId", ""))]
                + [str(tag) for tag in operation.get("tags", [])]
            ).casefold()
            if all(term in haystack for term in terms):
                matches.append((path, method.upper(), operation))

    if not matches:
        print("No matching operations found.")
        return 1

    for path, method, operation in matches[: max(args.limit, 0)]:
        print(f"{method} {path}  [{', '.join(operation.get('tags', []))}]")
        print(f"  {operation.get('summary', '(no summary)')}")
        if operation.get("operationId"):
            print(f"  operationId: {operation['operationId']}")
        request_body = operation.get("requestBody")
        if request_body:
            print("  requestBody: inspect full schema in the OpenAPI document")
        responses = ", ".join(operation.get("responses", {}).keys())
        print(f"  responses: {responses or '(not specified)'}")

    remaining = len(matches) - max(args.limit, 0)
    if remaining > 0:
        print(f"... {remaining} more matches; refine the query or raise --limit.")
    print(f"\nMatched {len(matches)} operation(s) in {args.spec.name}.")
    print("Use the full operation schema before making an API call.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
