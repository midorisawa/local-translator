import argparse
import html
import json
import shutil
from hashlib import sha256
from pathlib import Path


def validate_runtime(module):
    if b"_count_prompt_tokens" not in module.read_bytes():
        raise SystemExit(f"Incompatible Wasm runtime: {module}. Rebuild the wasm-v3 assets.")


def package_site(output, model_url=""):
    root = Path(__file__).resolve().parents[1]
    source = root / "src/local_translate_ui/static"
    static = output / "static"
    for directory in ("", "cpu", "gpu64", "cpu64"):
        validate_runtime(static / "runtime-v3" / directory / "plamo.mjs")
    app_assets = (
        "app.js", "i18n.js", "styles.css", "webgpu.js", "webgpu-worker.js",
        "browser-api.js", "browser-models.js", "browser-records.js", "browser-langid.js",
        "local-translator-ogp.png", "offline-cache.js", "tooltips.js",
    )
    for filename in (*app_assets, "local-translator.png"):
        shutil.copyfile(source / filename, static / filename)
    shutil.copytree(source / "locales", static / "locales", dirs_exist_ok=True)
    shutil.copyfile(root / "LICENSE", output / "LICENSE")

    index = (source / "index.html").read_text(encoding="utf-8")
    shell_assets = (*app_assets, "languages.json")
    asset_urls = {filename: f"./static/{filename}" for filename in shell_assets}
    asset_urls["webgpu-worker.js"] += "?v=3"
    for filename in ("app.js", "styles.css"):
        version = sha256((static / filename).read_bytes()).hexdigest()[:12]
        url = asset_urls[filename]
        asset_urls[filename] = f"{url}?v={version}"
        index = index.replace(f'"{url}"', f'"{asset_urls[filename]}"')
    mode = f'<meta name="plamo-webgpu" content="{html.escape(model_url, quote=True)}">'
    index = index.replace("</head>", f"  {mode}\n</head>", 1)
    (output / "index.html").write_text(index, encoding="utf-8")
    shutil.copyfile(source / "manifest.webmanifest", output / "manifest.webmanifest")

    app_shell = ["./", "./manifest.webmanifest", *asset_urls.values()]
    shell_hash = sha256(index.encode("utf-8"))
    for path in (source / "manifest.webmanifest", *(static / filename for filename in shell_assets)):
        shell_hash.update(path.read_bytes())
    service_worker = (source / "service-worker.js").read_text(encoding="utf-8")
    (output / "service-worker.js").write_text(
        f"const shellVersion = {json.dumps(shell_hash.hexdigest()[:12])};\n"
        f"const appShell = {json.dumps(app_shell)};\n{service_worker}",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    package_site(parser.parse_args().output)
