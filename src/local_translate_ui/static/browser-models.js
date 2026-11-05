export const modelSizes = { "0.8b": 0.57, "2b": 1.81, "8b": 5.28, "31b": 19.53 };
export const modelFilename = (id) => `plamo-3-translate-${id}-Q4_K_M.gguf`;
export const modelUrl = (id, override) => id === "0.8b" && override
  ? new URL(override, location.origin).href
  : `https://huggingface.co/pfnet/plamo-3-translate-${id}-GGUF/resolve/main/${modelFilename(id)}`;
export const modelCache = () => caches.open("plamo-models-v1");

export async function downloadModel(cache, url, progress, signal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("モデルをダウンロードできませんでした。");
  progress.total = Number(response.headers.get("content-length")) || 0;
  const stream = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      progress.received += chunk.byteLength;
      controller.enqueue(chunk);
    },
  }));
  const blob = await new Response(stream).blob();
  signal.throwIfAborted();
  await cache.put(url, new Response(blob));
}

export async function hasGpu() {
  if (!navigator.gpu || !WebAssembly.Suspending) return false;
  const adapter = await navigator.gpu.requestAdapter();
  return Boolean(adapter?.features.has("shader-f16"));
}
