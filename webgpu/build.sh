#!/usr/bin/env bash
set -euo pipefail

: "${WASM_RELEASE_URL:?Set WASM_RELEASE_URL to the versioned Wasm ZIP URL}"

mkdir -p .local
curl --fail --location --retry 3 -o .local/released-wasm.zip "$WASM_RELEASE_URL"
site=.local/webgpu-site
unzip -oq .local/released-wasm.zip -d "$site"
for file in languages.json langid.json langid.bin.gz langid-license.txt runtime/llama-license.txt; do
  if [[ ! -s "$site/static/$file" ]]; then
    echo "Missing static/$file in the Wasm Release ZIP. Use wasm-v2 or later."
    exit 1
  fi
done

source=src/local_translate_ui/static
cp "$source"/*.js "$source"/*.css "$site/static/"
cp "$source/index.html" LICENSE "$site/"
