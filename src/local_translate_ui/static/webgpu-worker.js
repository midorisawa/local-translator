import { t } from "./i18n.js";
import { hasGpu } from "./browser-models.js";
let runtime;
function status(text) {
  self.postMessage({ type: "status", text });
}

async function loadRuntime(blob, gpu, model) {
  const large = model === "8b" || model === "31b";
  const directory = large ? (gpu ? "gpu64/" : "cpu64/") : (gpu ? "" : "cpu/");
  const { default: createRuntime } = await import(`./runtime-v3/${directory}plamo.mjs`);
  const module = await createRuntime();
  const call = (name, types = [], args = []) =>
    module.ccall(name, "number", types, args, gpu ? { async: true } : undefined);
  module.FS.mkdir("/model");
  module.FS.mount(module.WORKERFS, { blobs: [{ name: "translate.gguf", data: blob }] }, "/model");
  try {
    const gpuLayers = model === "31b" ? 24 : -1;
    if (await call("load_model", ["number"], [gpuLayers]) !== 0) {
      throw new Error(t("モデルを読み込めませんでした。"));
    }
  } finally {
    module.FS.unmount("/model");
  }
  self.postMessage({ type: "device", text: gpu ? "WebGPU" : "CPU" });
  return { module, call };
}

async function load(blob, model, device) {
  if (device === "gpu") {
    if (await hasGpu()) {
      status(t("WebGPUにモデルを読み込み中…"));
      return loadRuntime(blob, true, model);
    }
    throw new Error(t("GPUを利用できません"));
  }
  status(t("CPUにモデルを読み込み中…"));
  return loadRuntime(blob, false, model);
}

function allocatePrompt(prompt) {
  const bytes = new TextEncoder().encode(prompt);
  const { module } = runtime;
  const pointer = module._malloc(bytes.length + 1);
  if (!pointer) throw new Error(t("原文を処理できませんでした。"));
  module.HEAPU8.set(bytes, pointer);
  module.HEAPU8[pointer + bytes.length] = 0;
  return pointer;
}

function countTokens(prompt) {
  const pointer = allocatePrompt(prompt);
  try {
    return runtime.module.ccall("count_prompt_tokens", "number", ["pointer"], [pointer]);
  } finally {
    runtime.module._free(pointer);
  }
}

function chunkEnd(text, start, fitsChunk, sentences) {
  const fits = (end) => fitsChunk(text.slice(start, end));
  let end = Math.min(start + 32000, text.length);
  if (!fits(end)) {
    let low = start;
    while (end - low > 1) {
      const middle = Math.floor((end + low) / 2);
      if (fits(middle)) low = middle;
      else end = middle;
    }
    end = low;
  }
  if (end === text.length) return end;
  const candidate = text.slice(start, end);
  const preferred = candidate.length * 0.6;
  for (const pattern of [/\r?\n[\t ]*\r?\n\s*/gu, /\r?\n[\t ]*/gu]) {
    let boundary = 0;
    for (const match of candidate.matchAll(pattern)) boundary = match.index + match[0].length;
    if (boundary >= preferred && boundary > 0 && fits(start + boundary)) return start + boundary;
  }
  let boundary = 0;
  for (const { index, segment } of sentences?.segment(candidate) ?? []) {
    const next = index + segment.length;
    if (next < candidate.length) boundary = next;
  }
  if (boundary >= preferred && boundary > 0 && fits(start + boundary)) return start + boundary;
  for (const match of candidate.matchAll(/\s+/gu)) boundary = match.index + match[0].length;
  if (boundary >= preferred && boundary > 0 && fits(start + boundary)) return start + boundary;
  const next = text.charCodeAt(end);
  return next >= 0xdc00 && next <= 0xdfff ? end - 1 : end;
}

async function translateChunk(prompt, separator) {
  const pointer = allocatePrompt(prompt);
  let space;
  try {
    space = await runtime.call("start_translation", ["pointer"], [pointer]);
  } finally {
    runtime.module._free(pointer);
  }
  if (space === -2) throw new Error(t("入力が長すぎます。原文を分けて翻訳してください。"));
  if (space < 0) throw new Error(t("原文を処理できませんでした。"));

  const decoder = new TextDecoder();
  const offset = Number(runtime.module._token_bytes());
  let translation = "";
  function emit(text) {
    if (!text) return;
    self.postMessage({ type: "delta", text: translation ? text : separator + text });
    translation += text;
  }
  const limit = Math.min(space, 4096);
  for (let index = 0; index < limit; index++) {
    const length = await runtime.call("next_token");
    if (length < 0) throw new Error(t("訳文の生成に失敗しました。"));
    if (length === 0) {
      emit(decoder.decode());
      return { translation, truncated: false };
    }
    emit(decoder.decode(runtime.module.HEAPU8.subarray(offset, offset + length), { stream: true }));
  }
  emit(decoder.decode());
  return { translation, truncated: true };
}

function historyTail(text) {
  return Array.from(text.trimEnd()).slice(-800).join("");
}

self.onmessage = async ({ data: { request, prompt: legacyPrompt, blob, model, device } }) => {
  try {
    runtime ??= await load(blob, model, device);
    if (request === undefined && legacyPrompt === undefined) {
      self.postMessage({ type: "done" });
      return;
    }
    self.postMessage({ type: "status", text: t("ブラウザー内で翻訳中…") });
    if (request === undefined) {
      const { truncated } = await translateChunk(legacyPrompt, "");
      self.postMessage({ type: "done", truncated });
      return;
    }
    const { text, prefix, glossary, input, output, historyOutput } = request;
    const sentences = Intl.Segmenter && new Intl.Segmenter(undefined, { granularity: "sentence" });
    const sourceBudget = 500 + countTokens("");
    let history = "";
    let separator = "";
    for (let start = 0; start < text.length;) {
      const prompt = (chunk) => {
        const boundary = chunk.length > 4000 && !chunk.endsWith("\n\n") ? "\n\n" : "";
        return prefix + history + glossary + input + chunk + boundary + output;
      };
      const promptLimit = 14336;
      const overhead = countTokens(prompt(""));
      if (overhead < 0 || overhead >= promptLimit) {
        throw new Error(t("参考文脈や用語集が長すぎます。短くしてから翻訳してください。"));
      }
      const end = chunkEnd(text, start, (chunk) => {
        const sourceCount = countTokens(chunk);
        if (sourceCount < 0 || sourceCount > sourceBudget) return false;
        const promptCount = countTokens(prompt(chunk));
        return promptCount >= 0 && promptCount <= promptLimit;
      }, sentences);
      if (end <= start) throw new Error(t("参考文脈や用語集が長すぎます。短くしてから翻訳してください。"));
      const chunk = text.slice(start, end);
      start = end;
      if (!chunk.trim()) {
        separator += chunk;
        continue;
      }
      const { translation, truncated } = await translateChunk(prompt(chunk), separator);
      if (truncated) {
        self.postMessage({ type: "done", truncated: true });
        return;
      }
      history = input + historyTail(chunk) + historyOutput + historyTail(translation);
      separator = chunk.match(/\s+$/u)?.[0] || "\n";
    }
    self.postMessage({ type: "done", truncated: false });
  } catch (error) {
    if (!runtime && device === "gpu") {
      console.warn("WebGPU initialization failed", error);
      self.postMessage({ type: "gpu-init-failed" });
    } else {
      self.postMessage({ type: "error", text: error.message });
    }
  }
};
