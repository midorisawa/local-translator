import { t } from "./i18n.js";

export const modelSizes = { "0.8b": 0.57, "2b": 1.81, "8b": 5.28, "31b": 19.53 };
export const modelFilename = (id) => `plamo-3-translate-${id}-Q4_K_M.gguf`;
export const modelUrl = (id, override) => id === "0.8b" && override
  ? new URL(override, location.origin).href
  : `https://huggingface.co/pfnet/plamo-3-translate-${id}-GGUF/resolve/main/${modelFilename(id)}`;
export const modelCache = () => caches.open("plamo-models-v1");

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
