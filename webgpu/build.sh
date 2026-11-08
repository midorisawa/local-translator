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
    echo "Missing or empty static/$1 in the Wasm Release ZIP. Use wasm-v3 or later." >&2
    exit 1
  fi
}
for file in languages.json langid.json langid.bin.gz langid-license.txt runtime-v3/llama-license.txt; do
  require_asset "$file"
done
for runtime in runtime-v3 runtime-v3/cpu runtime-v3/gpu64 runtime-v3/cpu64; do
  require_asset "$runtime/plamo.mjs"
  require_asset "$runtime/plamo.wasm"
done

python3 webgpu/package_site.py "$site"

rm -rf -- .local/webgpu-site
mv -T "$site" .local/webgpu-site
