import { t } from "./i18n.js";
import { deleteSavedModel, downloadModel, hasGpu, modelCache, modelFilename, modelSizes, modelUrl, savedModel, saveModel } from "./browser-models.js";
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

async function selected(cache) {
  const { model, device } = settings();
  const urls = new Set((await cache.keys()).map((request) => request.url));
  const installed = (await Promise.all(Object.keys(modelSizes).map(async (id) =>
    urls.has(urlFor(id)) || await savedModel(id) ? id : null
  ))).filter(Boolean);
  const gpu = await gpuAvailable;
  return {
    model: installed.includes(model) ? model : installed[0] || "0.8b",
    device: gpu && device !== "cpu" ? "gpu" : "cpu",
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
  const done = downloadModel(cache, id, urlFor(id), entry, controller.signal).catch(() => {
    entry.error = controller.signal.aborted ? t("ダウンロードを中止しました。") :
      t("モデルを保存できませんでした。通信とブラウザーの空き容量を確認してください。");
  }).finally(() => {
    entry.running = false;
    jobs.delete(id);
  });
  jobs.set(id, { controller, done });
  return done;
}

async function getBlob(model, onStatus) {
  const cache = await modelCache();
  const read = async () => await savedModel(model) ?? await (await cache.match(urlFor(model)))?.blob();
  let saved = await read();
  if (!saved) {
    onStatus(t("PLaMo {0}のモデルを取得中…", model.toUpperCase()));
    await startDownload(cache, model);
    saved = await read();
    if (!saved) throw new Error(progress.get(model)?.error || t("保存済みモデルを読み込めませんでした。"));
  }
  return saved;
}

export async function translationModel() {
  const { model, device } = await selected(await modelCache());
  return { model, device, getBlob: (onStatus) => getBlob(model, onStatus) };
}

export async function importModel(file) {
  const id = Object.keys(modelSizes).find((key) => modelFilename(key) === file.name);
  if (!id || await file.slice(0, 4).text() !== "GGUF") {
    throw new Error(t("対応するPLaMo 3 TranslateのQ4_K_M GGUFファイルを選んでください。"));
  }
  if (jobs.has(id)) throw new Error(t("ダウンロードが終わってから取り込んでください。"));
  const cache = await modelCache();
  await saveModel(cache, id, urlFor(id), file.stream());
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
  const { model, device, installed } = await selected(cache);
  if (resource === "models" && method === "GET") {
    return {
      models: Object.entries(modelSizes).map(([key, size]) => ({
        id: key, size, installed: installed.includes(key), download: progress.get(key),
      })),
      active: model,
      device: runtimeDevice || device,
      gpu_available: await gpuAvailable,
    };
  }
  if (resource === "downloads" && method === "DELETE") {
    jobs.get(id)?.controller.abort();
    return;
  }
  if (resource === "models" && Object.hasOwn(modelSizes, id)) {
    if (action === "download") {
      if (!installed.includes(id)) startDownload(cache, id);
      return;
    }
    if (action === "select") {
      if (id !== model && !installed.includes(id)) throw new Error(t("先にモデルをダウンロードしてください。"));
      const nextDevice = new URLSearchParams(path.split("?")[1]).get("device") || device;
      select(id, nextDevice);
      return;
    }
    if (method === "DELETE") {
      await deleteSavedModel(id);
      await cache.delete(urlFor(id));
      progress.delete(id);
      if (model === id) {
        select(installed.find((key) => key !== id) || "0.8b", device);
      }
      return;
    }
  }
  throw new Error(t("この操作を実行できません。"));
}
