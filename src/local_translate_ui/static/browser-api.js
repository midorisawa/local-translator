import { t } from "./i18n.js";
import {
  deleteSavedModel, downloadModel, hasGpu, hasMemory64, modelBytes, modelCache, modelFilename,
  modelLock, modelUrl, savedModel, saveModel, validModelMetadata,
} from "./browser-models.js";
import { recordApi } from "./browser-records.js";
import { resetRuntime, runtimeDevice } from "./webgpu.js";

const override = document.querySelector('meta[name="plamo-webgpu"]')?.content ?? "";
const jobs = new Map();
const progress = new Map();
const settingsKey = "plamo.browser.model";
const gpuAvailable = hasGpu().catch(() => false);
const urlFor = (id) => modelUrl(id, override);

function settings() {
  return JSON.parse(localStorage.getItem(settingsKey) || "{}");
}

function unsupported(id, gpu) {
  if ((id === "8b" || id === "31b") && !hasMemory64) {
    return t("このモデルにはMemory64に対応したブラウザーが必要です。");
  }
  if (id === "31b" && !gpu) {
    return t("31BはCPU用のブラウザーメモリ上限を超えます。WebGPUと十分なメモリを備えた端末で試してください。");
  }
  return "";
}

function runnable(id, device, gpu) {
  return !unsupported(id, gpu) && (id !== "31b" || device === "gpu");
}

async function selected(cache) {
  const { model, device } = settings();
  const urls = new Set((await cache.keys()).map((request) => request.url));
  const installed = (await Promise.all(Object.keys(modelBytes).map(async (id) =>
    urls.has(urlFor(id)) || await savedModel(id) ? id : null
  ))).filter(Boolean);
  const gpu = await gpuAvailable;
  const currentDevice = gpu && device !== "cpu" ? "gpu" : "cpu";
  const available = installed.filter((id) => runnable(id, currentDevice, gpu));
  return {
    model: available.includes(model) ? model : available[0] ?? null,
    device: currentDevice,
    gpu,
    installed,
  };
}

function select(model, device) {
  localStorage.setItem(settingsKey, JSON.stringify({ model, device }));
  resetRuntime();
}

function startDownload(cache, id) {
  if (jobs.has(id)) return jobs.get(id).done;
  const controller = new AbortController();
  const entry = { running: true, received: 0, total: 0, error: null };
  progress.set(id, entry);
  const url = urlFor(id);
  const done = modelLock(id, { signal: controller.signal }, async () => {
    if (await savedModel(id) || await cache.match(url)) return;
    await downloadModel(cache, id, url, entry, controller.signal);
  }).catch(() => {
    entry.error = controller.signal.aborted ? t("ダウンロードを中止しました。") :
      t("モデルを保存できませんでした。通信とブラウザーの空き容量を確認してください。");
  }).finally(() => {
    entry.running = false;
    jobs.delete(id);
  });
  jobs.set(id, { controller, done });
  return done;
}

async function getBlob(model, onStatus, savedOnly) {
  const cache = await modelCache();
  const read = async () => await savedModel(model) ?? await (await cache.match(urlFor(model)))?.blob();
  let saved = await read();
  if (!saved) {
    if (savedOnly) return null;
    onStatus(t("PLaMo {0}のモデルを取得中…", model.toUpperCase()));
    await startDownload(cache, model);
    saved = await read();
    if (!saved) throw new Error(progress.get(model)?.error || t("保存済みモデルを読み込めませんでした。"));
  }
  if (!await validModelMetadata(saved)) {
    throw new Error(t("モデルを読み込めませんでした。"));
  }
  return saved;
}

export async function translationModel(savedOnly = false) {
  const { model: active, device } = await selected(await modelCache());
  if (savedOnly && !active) return null;
  const model = active ?? "0.8b";
  return { model, device, getBlob: (onStatus) => getBlob(model, onStatus, savedOnly) };
}

export async function importModel(file) {
  const id = Object.keys(modelBytes).find((key) => modelFilename(key) === file.name);
  if (!id || file.size < modelBytes[id] || !await validModelMetadata(file)) {
    throw new Error(t("対応するPLaMo 3 TranslateのQ4_K_M GGUFファイルを選んでください。"));
  }
  const reason = unsupported(id, await gpuAvailable);
  if (reason) throw new Error(reason);
  if (jobs.has(id)) throw new Error(t("ダウンロードが終わってから取り込んでください。"));
  const cache = await modelCache();
  await modelLock(id, {}, () => saveModel(cache, id, urlFor(id), file.stream()));
  resetRuntime();
}

export async function browserApi(path, method, body) {
  const [resource, id, action] = path.split("?")[0].split("/");
  if (resource === "history" || resource === "glossaries") return recordApi(path, method, body);
  if (resource === "languages") {
    const response = await fetch(new URL("./languages.json", import.meta.url));
    if (!response.ok) throw new Error(t("言語一覧を取得できませんでした。"));
    return response.json();
  }
  const cache = await modelCache();
  const { model, device, gpu, installed } = await selected(cache);
  if (resource === "models" && method === "GET") {
    return {
      models: Object.entries(modelBytes).map(([key, bytes]) => ({
        id: key, size: Math.round(bytes / 1e7) / 100, installed: installed.includes(key),
        unavailable: unsupported(key, gpu), gpu_required: key === "31b",
        download: progress.get(key),
      })),
      active: model,
      device: runtimeDevice || device,
      preferred_device: device,
      gpu_available: gpu,
    };
  }
  if (resource === "downloads" && method === "DELETE") {
    jobs.get(id)?.controller.abort();
    return;
  }
  if (resource === "device" && (id === "cpu" || id === "gpu") && method === "PUT") {
    if (id === "gpu" && !gpu) throw new Error(t("GPUを利用できません"));
    select(settings().model, id);
    return;
  }
  if (resource === "models" && Object.hasOwn(modelBytes, id)) {
    if (action === "download") {
      const reason = unsupported(id, gpu);
      if (reason) throw new Error(reason);
      if (!installed.includes(id)) startDownload(cache, id);
      return;
    }
    if (action === "select") {
      if (!installed.includes(id)) throw new Error(t("先にモデルをダウンロードしてください。"));
      const nextDevice = new URLSearchParams(path.split("?")[1]).get("device") || device;
      const reason = unsupported(id, gpu && nextDevice === "gpu");
      if (reason) throw new Error(reason);
      select(id, nextDevice);
      return;
    }
    if (method === "DELETE") {
      await modelLock(id, {}, async () => {
        await deleteSavedModel(id);
        await cache.delete(urlFor(id));
      });
      progress.delete(id);
      if (model === id) {
        select(null, device);
      }
      return;
    }
  }
  throw new Error(t("この操作を実行できません。"));
}
