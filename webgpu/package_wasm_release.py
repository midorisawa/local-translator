from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

local = Path(__file__).resolve().parents[1] / ".local"
builds = ("webgpu-build", "cpu-build", "gpu64-build", "cpu64-build")
files = [Path(build) / name for build in builds for name in ("plamo.mjs", "plamo.wasm")]
files.append(Path("webgpu-build/llama-license.txt"))

for path in files:
    if not (local / path).is_file():
        raise SystemExit(f"Missing build output: {local / path}")

output = local / "wasm-runtime.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(local / path, path.as_posix())
print(output)
