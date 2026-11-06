import { t } from "./i18n.js";

export const modelBytes = { "0.8b": 573123200, "2b": 1807199392, "8b": 5280442080, "31b": 19526583392 };
export const modelFilename = (id) => `plamo-3-translate-${id}-Q4_K_M.gguf`;
export const modelUrl = (id, override) => id === "0.8b" && override
  ? new URL(override, location.origin).href
  : `https://huggingface.co/pfnet/plamo-3-translate-${id}-GGUF/resolve/main/${modelFilename(id)}`;
export const modelCache = () => caches.open("plamo-models-v1");

const maxMetadataBytes = 16 * 1024 * 1024;
const ggufValueBytes = [1, 1, 2, 2, 4, 4, 4, 1, 0, 0, 8, 8, 8];
const ggufString = 8;
const ggufArray = 9;

export async function validModelMetadata(file) {
  const view = new DataView(await file.slice(0, maxMetadataBytes).arrayBuffer());
  let offset = 0;
  function readUint32() {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  }
  function readLength() {
    const value = view.getBigUint64(offset, true);
    offset += 8;
    if (value > BigInt(view.byteLength)) throw new RangeError();
    return Number(value);
  }
  function skip(bytes) {
    offset += bytes;
    if (offset > view.byteLength) throw new RangeError();
  }
  function skipString() {
    skip(readLength());
  }

  try {
    if (readUint32() !== 0x46554747) return false;
    const version = readUint32();
    if (version !== 2 && version !== 3) return false;
    const tensors = readLength();
    const entries = readLength();
    if (!tensors || !entries) return false;

    // メタデータの値は展開せず、各フィールドが上限内に収まることを確認する
    for (let i = 0; i < entries; i++) {
      skipString();
      let type = readUint32();
      let count = 1;
      if (type === ggufArray) {
        type = readUint32();
        count = readLength();
      }
      if (type === ggufString) {
        if (count * 8 > view.byteLength - offset) return false;
        for (let j = 0; j < count; j++) skipString();
      } else {
        const bytes = ggufValueBytes[type];
        if (!bytes) return false;
        skip(count * bytes);
      }
    }
    // テンソル名と形状も確認し、重み本体は読み込まない
    for (let i = 0; i < tensors; i++) {
      skipString();
      const dimensions = readUint32();
      if (dimensions > 4) return false;
      skip(dimensions * 8 + 4 + 8);
    }
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

// Memory64と16GiBの上限を宣言したWasmメモリーセクション
export const hasMemory64 = WebAssembly.validate(Uint8Array.of(
  0, 97, 115, 109, 1, 0, 0, 0, 5, 6, 1, 5, 0, 128, 128, 16,
));

export function modelLock(id, options, action) {
  return navigator.locks ? navigator.locks.request(`plamo-model:${id}`, options, action) : action();
}

async function modelDirectory() {
  if (!navigator.storage?.getDirectory || !globalThis.FileSystemFileHandle?.prototype.createWritable) return null;
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("plamo-models-v1", { create: true });
}

export async function savedModel(id) {
  const directory = await modelDirectory();
  if (!directory) return null;
  try {
    const file = await (await directory.getFileHandle(modelFilename(id))).getFile();
    return file.size ? file : null;
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
    return null;
  }
}

export async function deleteSavedModel(id) {
  const directory = await modelDirectory();
  try {
    await directory?.removeEntry(modelFilename(id));
  } catch (error) {
    if (error.name !== "NotFoundError") throw error;
  }
}

export async function saveModel(cache, id, url, stream, signal) {
  const directory = await modelDirectory();
  signal?.throwIfAborted();
  if (directory) {
    const handle = await directory.getFileHandle(modelFilename(id), { create: true });
    const writer = await handle.createWritable();
    await stream.pipeTo(writer, { signal });
  } else {
    await cache.put(url, new Response(stream));
  }
}

export async function downloadModel(cache, id, url, progress, signal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(t("モデルをダウンロードできませんでした。"));
  progress.total = Number(response.headers.get("content-length")) || 0;
  const stream = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      progress.received += chunk.byteLength;
      controller.enqueue(chunk);
    },
  }));
  await saveModel(cache, id, url, stream, signal);
}

export async function hasGpu() {
  if (!navigator.gpu || !WebAssembly.Suspending) return false;
  const adapter = await navigator.gpu.requestAdapter();
  return Boolean(adapter?.features.has("shader-f16"));
}
