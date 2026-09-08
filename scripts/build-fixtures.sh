#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
target="wasm32-wasip1"

rustup target add "$target"
for source in "$root"/tests/fixtures/*.rs; do
  output="${source%.rs}.wasm"
  rustc --edition=2024 --target "$target" -C opt-level=s -C panic=abort \
    -C debuginfo=0 -C strip=symbols "$source" -o "$output"
done

