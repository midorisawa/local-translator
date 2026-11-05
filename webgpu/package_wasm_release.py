from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile

from language_assets import package_languages

local = Path(__file__).resolve().parents[1] / ".local"
builds = {"webgpu-build": "", "cpu-build": "cpu", "gpu64-build": "gpu64", "cpu64-build": "cpu64"}
runtime = Path("static/runtime")
files = {
    local / build / name: runtime / directory / name
    for build, directory in builds.items()
    for name in ("plamo.mjs", "plamo.wasm")
}
files[local / "webgpu-build/llama-license.txt"] = runtime / "llama-license.txt"

for path in files:
    if not path.is_file():
        raise SystemExit(f"Missing build output: {path}")

output = local / "wasm-runtime.zip"
with TemporaryDirectory(dir=local) as directory:
    static = Path(directory)
    package_languages(static)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path, destination in files.items():
            archive.write(path, destination.as_posix())
        for path in static.iterdir():
            archive.write(path, f"static/{path.name}")
print(output)
