# ローカルAI翻訳UI

[Read this in English](README.md)

**PLaMo 3 Translate** をブラウザー上で直接動作させる翻訳Webアプリケーションです。原文および訳文の処理はすべて端末のブラウザー内で完結し、外部サーバーへデータを送信することはありません。

---

## 主な機能とデータの保存先

- **画面の多言語対応**: 日本語や英語をはじめとする53言語に対応。お使いのブラウザーの優先言語に合わせて自動的にUIを切り替えます（一致する言語がない場合は英語で表示されます）。
- **充実した翻訳機能**:
  - 言語の自動判定
  - 前後の文脈を考慮した翻訳
  - 「自分の言語」が日本語の場合に、日本語訳の文体を指定（常体・敬体）
  - カスタム用語集の適用
  - 翻訳履歴の保存およびワンクリックでの再翻訳
- **履歴・用語集の保存**: ブラウザーのオリジンごとに隔離された **IndexedDB** に安全に保存されます。用語集はJSON形式でのインポート／エクスポートに対応しています。
- **モデルの管理と保存**:
  - モデルが未取得の場合は、アプリを開くと0.8Bモデルのダウンロード案内が表示されます。案内でダウンロードを選ぶと取得を開始します。
  - モデル管理パネルでは、ダウンロードの進捗確認やキャンセル、取得済みモデルの削除、対応するPLaMo 3 Translateの`Q4_K_M` GGUFファイルのインポートができます。
  - ダウンロードしたモデルはブラウザーの **OPFS（サイト専用ファイル領域）** に保存されます。OPFSへのストリーム書き込みに非対応の環境では、フォールバックとして **Cache Storage** を使用します。*(※ブラウザーの閲覧データを削除した場合や、ストレージ管理機能によって退避された場合は、再ダウンロードが必要です)*
- **実行環境（WebGPU / CPU）**:
  - 対応端末ではデフォルトで **WebGPU** を使用し、モデル選択パネルからCPU実行に切り替えることも可能です。
  - 8Bおよび31Bモデルの実行には、**64ビットWebAssembly（Memory64）** 対応環境と十分な空きメモリが必要です。
  - **31BモデルはWebGPUが必須**となります。ブラウザーのWasmメモリ上限（16GiB）を超えるため、モデルの一部をGPUメモリへオフロードして実行します。

---

## ビルドとローカル実行

### 事前準備

以下のツールをあらかじめインストールし、Emscripten環境を有効化（アクティベート）してください。

- [Emscripten SDK](https://emscripten.org/) `4.0.23`
- [CMake](https://cmake.org/)
- [Ninja](https://ninja-build.org/)
- Python `3.13` 以上
- [uv](https://github.com/astral-sh/uv)

また、[llama.cpp](https://github.com/ggml-org/llama.cpp/tree/15e50990bb2110e04798cbced77b7d0a5e1d772b) をコミット `15e5099` でクローンし、Dawnの [`emdawnwebgpu_pkg`](https://github.com/google/dawn/releases/download/v20260908.214631/emdawnwebgpu_pkg-v20260908.214631.zip) をあらかじめ展開しておきます。

### ビルド手順

依存ライブラリをそれぞれ `.local/llama-web` および `.local/emdawn/emdawnwebgpu_pkg` に配置している場合の実行例です。

```powershell
# 1. llama.cpp にパッチを適用
git -C .local/llama-web apply ../../webgpu/llama-wasm64.patch

# 2. 各種バイナリのビルド（WebGPU/CPU、32bit/64bit）
# 32bit WebGPU
emcmake cmake -S webgpu -B .local/webgpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/webgpu-build --target plamo

# 32bit CPU
emcmake cmake -S webgpu -B .local/cpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu-build --target plamo

# 64bit WebGPU
emcmake cmake -S webgpu -B .local/gpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/gpu64-build --target plamo

# 64bit CPU
emcmake cmake -S webgpu -B .local/cpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu64-build --target plamo

# 3. 配信用パッケージの作成とローカルサーバーの起動
uv run python webgpu/package.py .local/webgpu-build .local/webgpu-site --cpu-build .local/cpu-build --gpu64-build .local/gpu64-build --cpu64-build .local/cpu64-build
uv run python -m http.server 8876 --bind 127.0.0.1 --directory .local/webgpu-site
```

ブラウザーで[http://127.0.0.1:8876/](http://127.0.0.1:8876/)を開き、「自分の言語」と「よく使う言語」を設定してください。翻訳元は自動で判定され、翻訳先も自動で選ばれます。「翻訳」ボタンの隣から翻訳先を指定することもできます。

---

## ライセンス

- **アプリケーションコード**: [MITライセンス](LICENSE)
- **モデルの重み（ウェイト）**: [PLaMoコミュニティライセンス](https://plamo.preferredai.jp/info/plamo-community-license-ja)
  - 商用利用時の事前登録や契約条件の詳細については、[公式モデルカード](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/blob/main/README_ja.md#%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9)をご確認ください。
