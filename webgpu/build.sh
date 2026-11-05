#!/usr/bin/env bash
set -euo pipefail

: "${WASM_RELEASE_URL:?Set WASM_RELEASE_URL to the versioned Wasm ZIP URL}"

mkdir -p .local
if ! command -v uv >/dev/null; then
  curl --fail --location --retry 3 https://astral.sh/uv/0.13.4/install.sh -o .local/install-uv.sh
  UV_INSTALL_DIR="$PWD/.local/bin" UV_NO_MODIFY_PATH=1 sh .local/install-uv.sh
  export PATH="$PWD/.local/bin:$PATH"
fi

curl --fail --location --retry 3 -o .local/wasm-runtime.zip "$WASM_RELEASE_URL"
uv run --locked python -m zipfile -e .local/wasm-runtime.zip .local/released-wasm
uv run --locked python webgpu/package.py .local/released-wasm/webgpu-build .local/webgpu-site \
  --cpu-build .local/released-wasm/cpu-build \
  --gpu64-build .local/released-wasm/gpu64-build \
  --cpu64-build .local/released-wasm/cpu64-build
