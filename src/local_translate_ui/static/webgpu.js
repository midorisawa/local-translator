import { t } from "./i18n.js";
import { detectLanguage } from "./browser-langid.js";

const tag = "<|plamo:tag|>";
const msg = "<|plamo:msg|>";
const lang = "<|plamo:key|>lang<|plamo:val|>";
const idleTimeoutMs = 5 * 60 * 1000;
let worker;
let runtimeKey;
let idleTimer;
let warming;
let cancelRequest;
let runtimeGeneration = 0;
let pageActive = true;
export let runtimeDevice;

export function resetRuntime() {
  runtimeGeneration++;
  cancelRequest?.();
  cancelRequest = undefined;
  warming = undefined;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  if (worker) {
    worker.onmessage = worker.onerror = null;
    worker.terminate();
  }
  worker = undefined;
  runtimeKey = undefined;
  runtimeDevice = undefined;
}

window.addEventListener("pagehide", () => {
  pageActive = false;
  resetRuntime();
});
window.addEventListener("pageshow", () => {
  pageActive = true;
});

export async function translateInBrowser(body, onFragment, onStatus, selection, signal) {
  const terms = body.glossary || [];
  const inputs = [body.text, body.context, ...terms.flatMap(({ source, target }) => [source, target])];
  if (inputs.some((text) => text?.includes("<|plamo:") || text?.includes("\0"))) {
    throw new Error(t("入力にPLaMoの制御トークンやNUL文字を含めることはできません。"));
  }
  const automatic = body.source === "auto";
  const source = automatic ? await detectLanguage(body.text) : body.source;
  signal.throwIfAborted();
  const native = source === body.target ||
    (source === "zh" && (body.target === "zh-hans" || body.target === "zh-hant"));
  const target = body.frequent_language && native ? body.frequent_language : body.target;
  if (body.source === target) throw new Error(t("翻訳元と翻訳先に異なる言語を選んでください。"));
  if (body.form && target !== "ja" && !body.frequent_language) {
    throw new Error(t("文体を指定できるのは日本語への翻訳時です。"));
  }

  const context = body.context?.trim() ? `${tag}context${msg}${body.context}` : "";
  const glossary = terms.length ? `${tag}glossary` + terms.map(({ source, target }) =>
    `<|plamo:index|>${source}<|plamo:item|>${target}`).join("") : "";
  const form = body.form && target === "ja" ? `<|plamo:key|>form<|plamo:val|>${body.form}` : "";
  const inputLanguage = automatic ? "" : lang + source;
  const prompt = `${tag}dataset${msg}translation${context}${glossary}${tag}input${inputLanguage}${msg}${body.text}${tag}output${lang}${target}${form}${msg}`;
  const key = `${selection.model}/${selection.device}`;
  signal.addEventListener("abort", resetRuntime, { once: true });
  try {
    if (warming?.key === key) await warming.done;
    signal.throwIfAborted();
    const result = await runInference(selection, prompt, onFragment, (status) => {
      if (!signal.aborted) onStatus(status);
    });
    signal.throwIfAborted();
    return { source, target, ...result };
  } finally {
    signal.removeEventListener("abort", resetRuntime);
  }
}

export function warmRuntime(selection) {
  if (worker || warming) return;
  const job = {
    key: `${selection.model}/${selection.device}`,
    done: runInference(selection, undefined, () => {}, () => {}).catch(() => {}),
  };
  warming = job;
  job.done.then(() => {
    if (warming === job) warming = undefined;
  });
  return job.done;
}

async function runInference(selection, prompt, onFragment, onStatus) {
  if (!pageActive) {
    throw new Error(t("ブラウザーの推論ランタイムを起動できませんでした。"));
  }
  const key = `${selection.model}/${selection.device}`;
  if (runtimeKey !== key) resetRuntime();
  clearTimeout(idleTimer);
  const generation = runtimeGeneration;
  const blob = worker ? null : await selection.getBlob(onStatus);
  if (generation !== runtimeGeneration) {
    throw new Error(t("ブラウザーの推論ランタイムを起動できませんでした。"));
  }
  if (!worker && !blob) return;
  if (prompt === undefined && document.visibilityState !== "visible") return;
  function run(device) {
    worker ??= new Worker(new URL("./webgpu-worker.js", import.meta.url), { type: "module" });
    runtimeKey = key;
    const active = worker;
    return new Promise((resolve, reject) => {
      let text = "";
      cancelRequest = () => reject(new Error(t("ブラウザーの推論ランタイムを起動できませんでした。")));
      function fail(message) {
        cancelRequest = undefined;
        resetRuntime();
        reject(new Error(message));
      }
      function gpuInitFailed() {
        cancelRequest = undefined;
        active.terminate();
        worker = undefined;
        runtimeDevice = undefined;
        resolve(null);
      }
      active.onerror = () => {
        if (device === "gpu" && !runtimeDevice) gpuInitFailed();
        else fail(t("ブラウザーの推論ランタイムを起動できませんでした。"));
      };
      active.onmessage = ({ data }) => {
        switch (data.type) {
          case "status": onStatus(data.text); break;
          case "device":
            runtimeDevice = data.text === "WebGPU" ? "gpu" : "cpu";
            break;
          case "delta":
            text += data.text;
            onFragment(data.text);
            break;
          case "done":
            cancelRequest = undefined;
            active.onmessage = active.onerror = null;
            idleTimer = setTimeout(resetRuntime, idleTimeoutMs);
            resolve({ text: text.trim(), truncated: data.truncated });
            break;
          case "gpu-init-failed": gpuInitFailed(); break;
          case "error": fail(data.text); break;
        }
      };
      active.postMessage({ prompt, blob, model: selection.model, device });
    });
  }

  const result = await run(runtimeDevice || selection.device);
  if (result) return result;
  if (generation !== runtimeGeneration) {
    throw new Error(t("ブラウザーの推論ランタイムを起動できませんでした。"));
  }
  if (selection.model === "31b") {
    resetRuntime();
    throw new Error(t("31BはCPU用のブラウザーメモリ上限を超えます。WebGPUと十分なメモリを備えた端末で試してください。"));
  }
  return run("cpu");
}
