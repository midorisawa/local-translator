#!/usr/bin/env bash
set -eo pipefail

if ! command -v uv >/dev/null; then
  (
    uv_stage=$(mktemp -d)
    trap 'rm -rf -- "$uv_stage"' EXIT
    curl --fail --location --retry 3 https://astral.sh/uv/0.13.4/install.sh -o "$uv_stage/install.sh"
    UV_INSTALL_DIR="$PWD/.local/bin" UV_NO_MODIFY_PATH=1 sh "$uv_stage/install.sh"
  )
  export PATH="$PWD/.local/bin:$PATH"
fi

if ! command -v cmake >/dev/null || ! command -v ninja >/dev/null; then
  uv venv .local/build-tools
  uv pip install --python .local/build-tools/bin/python cmake ninja
  export PATH="$PWD/.local/build-tools/bin:$PATH"
fi

mkdir -p .local/emdawn
git clone --depth 1 --branch 4.0.23 https://github.com/emscripten-core/emsdk.git .local/emsdk
.local/emsdk/emsdk install 4.0.23
.local/emsdk/emsdk activate 4.0.23

git init .local/llama-web
git -C .local/llama-web fetch --depth 1 https://github.com/ggml-org/llama.cpp.git 15e50990bb2110e04798cbced77b7d0a5e1d772b
git -C .local/llama-web checkout --detach FETCH_HEAD
git -C .local/llama-web apply ../../webgpu/llama-wasm64.patch

curl --fail --location --retry 3 -o .local/emdawn.zip https://github.com/google/dawn/releases/download/v20260908.214631/emdawnwebgpu_pkg-v20260908.214631.zip
unzip -q .local/emdawn.zip -d .local/emdawn

source .local/emsdk/emsdk_env.sh
build() {
  local directory="$1"
  shift
  emcmake cmake -S webgpu -B "$directory" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "$@"
  cmake --build "$directory" --target plamo
}

dawn="-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
build .local/webgpu-build "$dawn"
build .local/cpu-build -DGGML_WEBGPU=OFF
build .local/gpu64-build "$dawn" -DLLAMA_WASM_MEM64=ON
build .local/cpu64-build -DGGML_WEBGPU=OFF -DLLAMA_WASM_MEM64=ON

uv run --locked python webgpu/package.py .local/webgpu-build .local/webgpu-site \
  --cpu-build .local/cpu-build --gpu64-build .local/gpu64-build --cpu64-build .local/cpu64-build
