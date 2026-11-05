# ローカル翻訳UI

PLaMo 3 Translateをブラウザーで動かす翻訳アプリです。原文と訳文はブラウザー内で処理し、外部へ送信しません。

## 主な機能とデータの保存先

- **翻訳機能**: 言語の自動判定、参考文脈の考慮、日本語訳の文体指定（敬体・常体など）、用語集の適用、翻訳履歴の保存、再翻訳に対応しています。
- **履歴・用語集**: ブラウザーのオリジンごとのIndexedDBに保存されます。用語集はJSON形式でのインポート／エクスポートが可能です。
- **モデルの管理と保存**:
  - 初回翻訳時にモデルが未取得の場合は、自動的に0.8Bモデルをダウンロードします。
  - モデル管理パネルから、ダウンロードの進捗確認・中断・削除や、既存の`Q4_K_M` GGUFファイルの読み込み（インポート）が行えます。
  - ダウンロードしたモデルはブラウザーのサイト専用ファイル領域（OPFS）に保存されます。OPFSへのストリーム書き込みに対応していないブラウザーではCache Storageを使います。サイトデータを削除した場合や、ブラウザーの容量確保機能によって削除された場合は、再度ダウンロードが必要です。
- **実行環境（WebGPU/CPU）**:
  - 対応端末ではデフォルトでWebGPUを使用し、モデル選択パネルからCPU実行に切り替えることも可能です。
  - 8B・31Bモデルの実行には、64ビットWebAssembly（Memory64）対応と十分な空きメモリが必要です。31BモデルはブラウザーのWasmメモリ上限（16GiB）を超えるため、WebGPUが必須です。モデルの一部をGPUメモリに配置して実行します。

## ビルドとローカル実行

ビルドにはEmscripten SDK 4.0.23、CMake、Ninja、Python 3.13以上、uvが必要です。あらかじめEmscripten環境を有効にしてください。

また、[llama.cpp](https://github.com/ggml-org/llama.cpp/tree/15e50990bb2110e04798cbced77b7d0a5e1d772b)を指定のコミットでクローンし、[Dawnのemdawnwebgpuパッケージ](https://github.com/google/dawn/releases/download/v20260908.214631/emdawnwebgpu_pkg-v20260908.214631.zip)を展開しておきます。

以下は、それぞれを`.local/llama-web`および`.local/emdawn/emdawnwebgpu_pkg`に配置した場合のビルド・実行手順です。

```powershell
# パッチの適用
git -C .local/llama-web apply ../../webgpu/llama-wasm64.patch

# 各種バイナリのビルド（WebGPU/CPU、32bit/64bit）
emcmake cmake -S webgpu -B .local/webgpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/webgpu-build --target plamo

emcmake cmake -S webgpu -B .local/cpu-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu-build --target plamo

emcmake cmake -S webgpu -B .local/gpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON "-DLLAMA_CPP_DIR=$PWD/.local/llama-web" "-DEMDAWNWEBGPU_DIR=$PWD/.local/emdawn/emdawnwebgpu_pkg"
cmake --build .local/gpu64-build --target plamo

emcmake cmake -S webgpu -B .local/cpu64-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLAMA_WASM_MEM64=ON -DGGML_WEBGPU=OFF "-DLLAMA_CPP_DIR=$PWD/.local/llama-web"
cmake --build .local/cpu64-build --target plamo

# 配信用パッケージの作成とローカルサーバーの起動
uv run python webgpu/package.py .local/webgpu-build .local/webgpu-site --cpu-build .local/cpu-build --gpu64-build .local/gpu64-build --cpu64-build .local/cpu64-build
uv run python -m http.server 8876 --bind 127.0.0.1 --directory .local/webgpu-site
```

ブラウザーで[http://127.0.0.1:8876/](http://127.0.0.1:8876/)を開き、自分の言語と翻訳先言語を選択して翻訳を実行してください。

## ライセンス

- アプリケーションコード: [MITライセンス](LICENSE)
- モデルの重み（ウェイト）: [PLaMoコミュニティライセンス](https://plamo.preferredai.jp/info/plamo-community-license-ja)
  - 商用利用時の事前登録や契約条件などの詳細は、[公式モデルカード](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/blob/main/README_ja.md#ライセンス)をご確認ください。
