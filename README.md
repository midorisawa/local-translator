# Local Translation UI

A client-side translation web application powered by **PLaMo 3 Translate** running directly in your browser. All source and translated texts are processed entirely locally and never sent to external servers.

---

## Features & Data Storage

- **Multilingual UI**: Supports 53 languages, including Japanese and English. The interface automatically adapts to your browser's preferred language (falls back to English if no match is found).
- **Rich Translation Features**:
  - Automatic language detection
  - Context-aware translation
  - Japanese style selection (e.g., polite *Keitai* / casual *Jotai*)
  - Custom glossary support
  - Translation history and one-click re-translation
- **History & Glossary Storage**: Stored securely in your browser's origin-scoped **IndexedDB**. Glossaries can be imported and exported in JSON format.
- **Model Management**:
  - Automatically downloads the **0.8B model** on your first translation request if no model is present.
  - The model management panel allows you to monitor download progress, pause/cancel downloads, delete existing models, or import your own `Q4_K_M` GGUF files.
  - Downloaded models are stored in the browser's **Origin Private File System (OPFS)**. For browsers without streaming write support for OPFS, **Cache Storage** is used as a fallback. *(Note: Models will need to be re-downloaded if browsing data is cleared or evicted by the browser's storage manager).*
- **Runtime Environment (WebGPU / CPU)**:
  - Uses **WebGPU** by default on supported devices, with an option to switch to CPU execution in the model selection panel.
  - Running larger models (8B and 31B) requires **64-bit WebAssembly (Memory64)** support and sufficient system memory.
  - The **31B model strictly requires WebGPU**, as it exceeds the browser's WebAssembly memory limit (16 GiB). Part of the model is offloaded to GPU memory to enable execution.

---

## Building and Running Locally

### Prerequisites

- [Emscripten SDK](https://emscripten.org/) `4.0.23` (make sure your environment is activated)
- [CMake](https://cmake.org/)
- [Ninja](https://ninja-build.org/)
- Python `3.13` or newer
- [uv](https://github.com/astral-sh/uv)

Clone [llama.cpp](https://github.com/ggml-org/llama.cpp/tree/15e50990bb2110e04798cbced77b7d0a5e1d772b) at commit `15e5099` and extract Dawn's [`emdawnwebgpu_pkg`](https://github.com/google/dawn/releases/download/v20260908.214631/emdawnwebgpu_pkg-v20260908.214631.zip).

### Build Steps

The following steps assume the dependencies are placed at `.local/llama-web` and `.local/emdawn/emdawnwebgpu_pkg` respectively:

```powershell
# 1. Apply patch to llama.cpp
git -C .local/llama-web apply ../../webgpu/llama-wasm64.patch

# 2. Build binaries (WebGPU / CPU, 32-bit / 64-bit variants)
# 32-bit WebGPU
emcmake cmake -S webgpu -B .local/webgpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/webgpu-build --target plamo

# 32-bit CPU
emcmake cmake -S webgpu -B .local/cpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu-build --target plamo

# 64-bit WebGPU
emcmake cmake -S webgpu -B .local/gpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/gpu64-build --target plamo

# 64-bit CPU
emcmake cmake -S webgpu -B .local/cpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu64-build --target plamo

# 3. Bundle distribution files and launch a local server
uv run python webgpu/package.py .local/webgpu-build .local/webgpu-site --cpu-build .local/cpu-build --gpu64-build .local/gpu64-build --cpu64-build .local/cpu64-build
uv run python -m http.server 8876 --bind 127.0.0.1 --directory .local/webgpu-site
```

Open [http://127.0.0.1:8876/](http://127.0.0.1:8876/) in your browser, select your source and target languages, and start translating!

---

## License

- **Application Code**: [MIT License](LICENSE)
- **Model Weights**: [PLaMo Community License](https://plamo.preferredai.jp/info/plamo-community-license-ja)
  - For details regarding commercial use, prior registration, and licensing terms, please refer to the [official model card](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/blob/main/README_ja.md#%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9).