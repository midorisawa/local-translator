import argparse
import html
import json
import shutil
from hashlib import sha256
from pathlib import Path

from language_assets import package_languages

parser = argparse.ArgumentParser()
parser.add_argument("build", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--cpu-build", type=Path, required=True)
parser.add_argument("--gpu64-build", type=Path, required=True)
parser.add_argument("--cpu64-build", type=Path, required=True)
parser.add_argument("--model-url", default="")
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
source = root / "src/local_translate_ui/static"
static = args.output / "static"
runtime = static / "runtime"
runtime.mkdir(parents=True, exist_ok=True)
app_assets = (
    "app.js", "i18n.js", "styles.css", "webgpu.js", "webgpu-worker.js",
    "browser-api.js", "browser-models.js", "browser-records.js", "browser-langid.js", "local-translator.png",
    "offline-cache.js",
)
for filename in (*app_assets, "local-translator-ogp.png"):
    shutil.copyfile(source / filename, static / filename)
shutil.copytree(source / "locales", static / "locales", dirs_exist_ok=True)
for build, destination in (
    (args.build, runtime), (args.cpu_build, runtime / "cpu"),
    (args.gpu64_build, runtime / "gpu64"), (args.cpu64_build, runtime / "cpu64"),
):
    destination.mkdir(exist_ok=True)
    for filename in ("plamo.mjs", "plamo.wasm"):
        shutil.copyfile(build / filename, destination / filename)
shutil.copyfile(root / "LICENSE", args.output / "LICENSE")
shutil.copyfile(args.build / "llama-license.txt", runtime / "llama-license.txt")
package_languages(static)

index = (source / "index.html").read_text(encoding="utf-8")
shell_assets = (*app_assets, "languages.json")
asset_urls = {filename: f"./static/{filename}" for filename in shell_assets}
for filename in ("app.js", "styles.css"):
    version = sha256((static / filename).read_bytes()).hexdigest()[:12]
    url = asset_urls[filename]
    asset_urls[filename] = f"{url}?v={version}"
    index = index.replace(f'"{url}"', f'"{asset_urls[filename]}"')
mode = f'<meta name="plamo-webgpu" content="{html.escape(args.model_url, quote=True)}">'
index = index.replace("</head>", f"  {mode}\n</head>", 1)
(args.output / "index.html").write_text(index, encoding="utf-8")
shutil.copyfile(source / "manifest.webmanifest", args.output / "manifest.webmanifest")
app_shell = ["./", "./manifest.webmanifest", *asset_urls.values()]
shell_hash = sha256(index.encode("utf-8"))
for path in (source / "manifest.webmanifest", *(static / filename for filename in shell_assets)):
    shell_hash.update(path.read_bytes())
service_worker = (source / "service-worker.js").read_text(encoding="utf-8")
(args.output / "service-worker.js").write_text(
    f"const shellVersion = {json.dumps(shell_hash.hexdigest()[:12])};\n"
    f"const appShell = {json.dumps(app_shell)};\n{service_worker}",
    encoding="utf-8",
)
