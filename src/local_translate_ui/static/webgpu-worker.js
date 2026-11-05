import { hasGpu } from "./browser-models.js";
let runtime;
function status(text) {
  self.postMessage({ type: "status", text });
}

async function loadRuntime(blob, gpu, model) {
  const large = model === "8b" || model === "31b";
  const directory = large ? (gpu ? "gpu64/" : "cpu64/") : (gpu ? "" : "cpu/");
  const { default: createRuntime } = await import(`./runtime/${directory}plamo.mjs`);
  const module = await createRuntime();
  const call = (name, types = [], args = []) =>
    module.ccall(name, "number", types, args, gpu ? { async: true } : undefined);
  module.FS.mkdir("/model");
  module.FS.mount(module.WORKERFS, { blobs: [{ name: "translate.gguf", data: blob }] }, "/model");
  try {
    const gpuLayers = model === "31b" ? 24 : -1;
    if (await call("load_model", ["number"], [gpuLayers]) !== 0) {
      throw new Error("モデルを読み込めませんでした。");
    }
  } finally {
    module.FS.unmount("/model");
  }
  self.postMessage({ type: "device", text: gpu ? "WebGPU" : "CPU" });
  return { module, call };
}

async function load(blob, model, device) {
  if (device === "gpu") {
    try {
      if (await hasGpu()) {
        status("WebGPUにモデルを読み込み中…");
        return await loadRuntime(blob, true, model);
      }
    } catch (error) {
      console.warn("WebGPU initialization failed", error);
    }
  }
  if (model === "31b") {
    throw new Error("31BはCPU用のブラウザーメモリ上限を超えます。WebGPUと十分なメモリを備えた端末で試してください。");
  }
  status("CPUにモデルを読み込み中…");
  return loadRuntime(blob, false, model);
}

self.onmessage = async ({ data: { prompt, blob, model, device } }) => {
  try {
    runtime ??= await load(blob, model, device);
    self.postMessage({ type: "status", text: "ブラウザー内で翻訳中…" });
    const space = await runtime.call("start_translation", ["string"], [prompt]);
    if (space === -2) throw new Error("入力が長すぎます。原文を分けて翻訳してください。");
    if (space < 0) throw new Error("原文を処理できませんでした。");

    const decoder = new TextDecoder();
    const offset = Number(runtime.module._token_bytes());
    const limit = Math.min(space, 4096);
    let ended = false;
    for (let index = 0; index < limit; index++) {
      const length = await runtime.call("next_token");
      if (length < 0) throw new Error("訳文の生成に失敗しました。");
      if (length === 0) {
        ended = true;
        break;
      }
      const text = decoder.decode(runtime.module.HEAPU8.subarray(offset, offset + length), { stream: true });
      if (text) self.postMessage({ type: "delta", text });
    }
    const tail = decoder.decode();
    if (tail) self.postMessage({ type: "delta", text: tail });
    self.postMessage({ type: "done", truncated: !ended });
  } catch (error) {
    self.postMessage({ type: "error", text: error.message });
  }
};
