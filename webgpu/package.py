import argparse
import shutil
from pathlib import Path

from language_assets import package_languages
from package_site import package_site

parser = argparse.ArgumentParser()
parser.add_argument("build", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--cpu-build", type=Path, required=True)
parser.add_argument("--gpu64-build", type=Path, required=True)
parser.add_argument("--cpu64-build", type=Path, required=True)
parser.add_argument("--model-url", default="")
args = parser.parse_args()

static = args.output / "static"
runtime = static / "runtime"
runtime.mkdir(parents=True, exist_ok=True)
for build, destination in (
    (args.build, runtime), (args.cpu_build, runtime / "cpu"),
    (args.gpu64_build, runtime / "gpu64"), (args.cpu64_build, runtime / "cpu64"),
):
    destination.mkdir(exist_ok=True)
    for filename in ("plamo.mjs", "plamo.wasm"):
        shutil.copyfile(build / filename, destination / filename)
shutil.copyfile(args.build / "llama-license.txt", runtime / "llama-license.txt")
package_languages(static)
package_site(args.output, args.model_url)
