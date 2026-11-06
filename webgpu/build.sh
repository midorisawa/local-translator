#!/usr/bin/env bash
set -euo pipefail

: "${WASM_RELEASE_URL:?Set WASM_RELEASE_URL to the versioned Wasm ZIP URL}"

mkdir -p .local
stage=$(mktemp -d .local/build.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
site="$stage/site"
curl --fail --location --retry 3 -o "$stage/wasm.zip" "$WASM_RELEASE_URL"
unzip -q "$stage/wasm.zip" -d "$site"
require_asset() {
  if [[ ! -f "$site/static/$1" || ! -s "$site/static/$1" ]]; then
    echo "Missing or empty static/$1 in the Wasm Release ZIP. Use wasm-v2 or later." >&2
    exit 1
  fi
}
for file in languages.json langid.json langid.bin.gz langid-license.txt runtime/llama-license.txt; do
  require_asset "$file"
done
for runtime in runtime runtime/cpu runtime/gpu64 runtime/cpu64; do
  require_asset "$runtime/plamo.mjs"
  require_asset "$runtime/plamo.wasm"
done

source=src/local_translate_ui/static
cp "$source"/*.js "$source"/*.css "$source/local-translator.png" "$site/static/"
cp -R "$source/locales" "$site/static/"
cp "$source/index.html" LICENSE "$site/"

rm -rf -- .local/webgpu-site
mv -T "$site" .local/webgpu-site
