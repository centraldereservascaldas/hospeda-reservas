#!/bin/sh
set -eu

base=${1:-http://127.0.0.1}
html=$(curl --fail --silent --show-error --max-time 10 "$base/")
asset=$(printf '%s' "$html" | sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' | head -n 1)
test -n "$asset"
headers=$(curl --head --fail --silent --show-error --max-time 10 "$base$asset")
printf '%s\n' "$headers" | grep -iEq '^cache-control:.*public.*max-age=31536000.*immutable'
test "$(printf '%s\n' "$headers" | grep -ic '^cache-control:')" -eq 1

previous=$(php -r '$m = json_decode(file_get_contents("public/assets/.retained-assets.json"), true, flags: JSON_THROW_ON_ERROR); echo array_values(array_filter(array_keys($m["retained"]), static fn (string $name): bool => preg_match("/\\.(js|css)$/", $name) === 1))[0] ?? "";')
if [ -n "$previous" ]; then
  headers=$(curl --head --fail --silent --show-error --max-time 10 "$base/assets/$previous")
  printf '%s\n' "$headers" | grep -iEq '^cache-control:.*immutable'
fi

for method in GET HEAD; do
  headers=$(mktemp)
  trap 'rm -f "$headers"' EXIT HUP INT TERM
  if [ "$method" = HEAD ]; then
    set -- --head
  else
    set --
  fi
  status=$(curl "$@" --silent --show-error --max-time 10 --dump-header "$headers" --output /dev/null --write-out '%{http_code}' "$base/assets/missing-00000000.js")
  test "$status" = 404
  grep -iEq '^cache-control: *no-store, max-age=0' "$headers"
  test "$(grep -ic '^cache-control:' "$headers")" -eq 1
  if grep -iEq '^expires:|^cache-control:.*(immutable|public)' "$headers"; then
    rm -f "$headers"
    exit 1
  fi
  rm -f "$headers"
  trap - EXIT HUP INT TERM
done
for resource in / /api/health; do
  headers=$(curl --head --fail --silent --show-error --max-time 10 "$base$resource")
  if printf '%s\n' "$headers" | grep -iEq '^cache-control:.*immutable'; then
    exit 1
  fi
done
printf '%s\n' 'Static asset caching and retention verified.'
