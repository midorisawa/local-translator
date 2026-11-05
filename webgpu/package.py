import argparse
import html
import shutil
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
for filename in (
    "app.js", "styles.css", "webgpu.js", "webgpu-worker.js",
    "browser-api.js", "browser-models.js", "browser-records.js", "browser-langid.js",
):
    shutil.copyfile(source / filename, static / filename)
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
mode = f'<meta name="plamo-webgpu" content="{html.escape(args.model_url, quote=True)}">'
index = index.replace("</head>", f"  {mode}\n</head>", 1)
(args.output / "index.html").write_text(index, encoding="utf-8")
