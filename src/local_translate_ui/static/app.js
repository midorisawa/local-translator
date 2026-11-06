import { localizePage, preferredLocale, t, uiLocale } from "./i18n.js";

localizePage();

const $ = (id) => document.getElementById(id);
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
const themeToggle = $("theme-toggle");
const themeKey = "plamo.theme";
let theme;
try {
  theme = localStorage.getItem(themeKey);
} catch {
  // 保存済みの設定を読み込めない場合は端末の設定を使う
}

function updateTheme() {
  const manual = theme === "dark" || theme === "light";
  const dark = manual ? theme === "dark" : systemTheme.matches;
  if (manual) document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.title = dark ? t("ライトモードに切り替える") : t("ダークモードに切り替える");
  if (manual) {
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = dark ? "#171719" : "#ffffff";
    }
  }
}

themeToggle.addEventListener("click", () => {
  theme = themeToggle.getAttribute("aria-pressed") === "true" ? "light" : "dark";
  updateTheme();
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // 保存できない場合も現在のページには反映する
  }
});
systemTheme.addEventListener("change", updateTheme);
updateTheme();

const model = $("model");
const device = $("device");
const modelPicker = $("model-picker");
let installedModels = [];
let modelDraft = null;
const source = $("source");
const target = $("target");
const nativeLanguage = $("native-language");
const frequentLanguage = $("frequent-language");
const nativeLanguageDialog = $("native-language-dialog");
const nativeLanguageKey = "plamo.nativeLanguage";
const frequentLanguageKey = "plamo.frequentLanguage";
const translationOptionsKey = "plamo.translationOptions";
let savedNativeLanguage = "";
let savedFrequentLanguage = "";
const text = $("text");
const output = $("output");
const resultLanguages = new WeakMap();
const copyTimers = new WeakMap();
const form = $("form");
const panes = document.querySelector(".panes");
const singlePane = matchMedia("(width < 1000px)");
const mobileSidebar = matchMedia("(max-width: 640px)");
const firstResult = output.closest(".pane");
let firstVisiblePane = 0;
let resultNumber = 0;
let currentHistoryId = null;
const manager = $("manager");
const rows = new Map();
let glossaryPresets = [];
let selectedGlossaryIds = new Set();
const activeGlossary = $("active-glossary");
let editingGlossaryId = "";
const translationSettings = activeGlossary.closest("details");
const settingsPanel = translationSettings.querySelector(".settings-panel");
const settingsTrigger = translationSettings.querySelector("summary");

function positionSettingsPanel() {
  if (!translationSettings.open) return;
  const rect = settingsTrigger.getBoundingClientRect();
  const width = Math.min(256, window.innerWidth - 24);
  const above = rect.top - 18;
  const below = window.innerHeight - rect.bottom - 18;
  settingsPanel.style.width = `${width}px`;
  const openAbove = above >= settingsPanel.scrollHeight || above >= below;
  settingsPanel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  settingsPanel.style.top = openAbove ? "auto" : `${rect.bottom + 6}px`;
  settingsPanel.style.bottom = openAbove ? `${window.innerHeight - rect.top + 6}px` : "auto";
  settingsPanel.style.maxHeight = `${Math.max(0, openAbove ? above : below)}px`;
}

translationSettings.addEventListener("toggle", positionSettingsPanel);
window.addEventListener("resize", positionSettingsPanel);
window.addEventListener("scroll", positionSettingsPanel, true);
let state = { models: [] };
let translating = false;
let selecting = false;
let refreshing = false;
let historyRequest = 0;
let historyRestoreRequest = 0;
let editingHistory = false;
let deletingHistory = false;
const selectedHistory = new Set();

const translationMessages = document.querySelector(".translation-messages");

function fitPanesToViewport() {
  const main = panes.closest("main");
  const padding = getComputedStyle(main);
  const top = main.getBoundingClientRect().top + window.scrollY;
  const limit = Math.max(208, window.innerHeight - top -
    parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) -
    translationMessages.getBoundingClientRect().height - 2);
  panes.style.setProperty("--pane-limit", `${limit}px`);
}

const layoutObserver = new ResizeObserver(fitPanesToViewport);
layoutObserver.observe(translationMessages);
layoutObserver.observe(document.querySelector(".sidebar"));
layoutObserver.observe($("mobile-sidebar-toggle"));
window.addEventListener("resize", fitPanesToViewport);
singlePane.addEventListener("change", () => showPanes(firstVisiblePane, "instant"));

const mobileSidebarToggle = $("mobile-sidebar-toggle");
function setMobileSidebar(expanded) {
  mobileSidebarToggle.setAttribute("aria-expanded", String(expanded));
  mobileSidebarToggle.setAttribute("aria-label", expanded ? t("サイドバーを閉じる") : t("サイドバーを開く"));
}

mobileSidebarToggle.addEventListener("click", () => {
  setMobileSidebar(mobileSidebarToggle.getAttribute("aria-expanded") === "false");
});
document.addEventListener("click", (event) => {
  if (!mobileSidebar.matches || mobileSidebarToggle.getAttribute("aria-expanded") === "false") return;
  if (!event.target.closest("#app-sidebar, #mobile-sidebar-toggle, dialog")) setMobileSidebar(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !mobileSidebar.matches ||
      mobileSidebarToggle.getAttribute("aria-expanded") === "false" || document.querySelector("dialog[open]")) return;
  setMobileSidebar(false);
  mobileSidebarToggle.focus();
});

function lastPanePosition() {
  return Math.max(0, panes.children.length - (singlePane.matches ? 1 : 2));
}

function updatePaneNavigation() {
  const last = lastPanePosition();
  $("pane-navigation").hidden = last === 0;
  $("pane-previous").disabled = firstVisiblePane === 0;
  $("pane-next").disabled = firstVisiblePane === last ||
    (singlePane.matches && firstVisiblePane === 0 && !output.value && panes.children.length === 2);
}

function showPanes(index, behavior = "auto") {
  const last = lastPanePosition();
  firstVisiblePane = Math.min(Math.max(index, 0), last);
  const paneWidth = panes.firstElementChild.getBoundingClientRect().width;
  const direction = document.documentElement.dir === "rtl" ? -1 : 1;
  panes.scrollTo({ left: direction * paneWidth * firstVisiblePane, behavior });
  updatePaneNavigation();
}

panes.addEventListener("scrollend", () => {
  const paneWidth = panes.firstElementChild.getBoundingClientRect().width;
  if (!paneWidth) return;
  const direction = document.documentElement.dir === "rtl" ? -1 : 1;
  firstVisiblePane = Math.max(0, Math.min(lastPanePosition(), Math.round(direction * panes.scrollLeft / paneWidth)));
  updatePaneNavigation();
});
$("pane-previous").addEventListener("click", () => showPanes(firstVisiblePane - 1));
$("pane-next").addEventListener("click", () => showPanes(firstVisiblePane + 1));
showPanes(0);

function resetResults() {
  currentHistoryId = null;
  while (firstResult.nextElementSibling) firstResult.nextElementSibling.remove();
  firstResult.querySelector(".elapsed").textContent = "";
  clearCopied(firstResult);
  resultLanguages.delete(firstResult);
  showPanes(0, "instant");
}

function startNewTranslation() {
  historyRestoreRequest++;
  setMobileSidebar(false);
  text.value = "";
  text.scrollTop = 0;
  output.value = "";
  $("context").value = "";
  $("context").closest("details").open = false;
  translationSettings.open = false;
  source.value = "auto";
  target.value = "auto";
  resetResults();
  feedback("feedback", displayedWarmup ? t("モデルを読み込み中…") : "");
  updateControls();
}

$("new-translation").addEventListener("click", startNewTranslation);
$("mobile-new-translation").addEventListener("click", startNewTranslation);

async function api(path, method = "GET", body) {
  const { browserApi } = await import("./browser-api.js");
  return browserApi(path, method, body);
}

let warmupRequest = 0;
let displayedWarmup;
async function warmVisibleTab() {
  if (document.visibilityState !== "visible" || translating || selecting) return;
  const request = ++warmupRequest;
  try {
    const { translationModel } = await import("./browser-api.js");
    const { warmRuntime } = await import("./webgpu.js");
    const selection = await translationModel(true);
    if (request === warmupRequest && selection &&
        document.visibilityState === "visible" && !translating && !selecting) {
      const pending = warmRuntime(selection);
      if (!pending) return;
      const message = t("モデルを読み込み中…");
      displayedWarmup = pending;
      feedback("feedback", message);
      await pending;
      if (displayedWarmup === pending) {
        displayedWarmup = undefined;
        if (!translating && $("feedback").textContent === message) feedback("feedback", "");
      }
    }
  } catch {
    // 事前読み込みに失敗した場合は翻訳時に再試行する
  }
}
document.addEventListener("visibilitychange", warmVisibleTab);
warmVisibleTab();

async function translateStream(body, onFragment) {
  const { translateInBrowser } = await import("./webgpu.js");
  const { translationModel } = await import("./browser-api.js");
  const result = await translateInBrowser(
    body, onFragment, (message) => feedback("feedback", message), await translationModel(),
  );
  if (body.save_history && result.text) {
    try {
      const id = crypto.randomUUID();
      await api("history", "POST", {
        ...result, id, created_at: new Date().toISOString(), original: body.text,
        source_selection: body.source, target_selection: body.frequent_language ? "auto" : body.target,
      });
      result.history_id = id;
    } catch {
      result.history_error = t("訳文は取得できましたが、履歴を保存できませんでした。");
    }
  }
  return result;
}

function updateStreamText(field, text) {
  const hadOutput = Boolean(output.value);
  const position = field.scrollTop;
  field.value = text;
  field.scrollTop = position;
  if (field === output && hadOutput !== Boolean(text)) updatePaneNavigation();
}

let glossaryFeedbackTimer;

function feedback(id, message, error = false) {
  const element = $(id);
  if (element.textContent !== message) element.textContent = message;
  element.classList.toggle("error", error);
  if (id === "glossary-feedback") {
    clearTimeout(glossaryFeedbackTimer);
    if (message && !error) {
      glossaryFeedbackTimer = setTimeout(() => feedback(id, ""), 3000);
    }
  }
}

function confirmAction(title, description, action, destructive = true) {
  const dialog = $("confirm-action");
  if (dialog.open) return Promise.resolve(false);
  const heading = $("confirm-title");
  heading.textContent = title;
  $("confirm-description").textContent = description;
  $("confirm-submit").textContent = action;
  $("confirm-submit").classList.toggle("danger", destructive);
  $("confirm-submit").classList.toggle("primary", !destructive);
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.showModal();
    if (!destructive) heading.focus();
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

function updateControls() {
  updatePaneNavigation();
  modelPicker.querySelector("summary").setAttribute("aria-busy", String(selecting || Boolean(state.loading)));
  const busy = translating || selecting || Boolean(state.loading);
  const waitingForModel = modelDraft && (modelDraft.model !== modelDraft.initialModel ||
    modelDraft.device !== modelDraft.initialDevice);
  $("translate").disabled = busy || waitingForModel || !state.models.length || !savedFrequentLanguage || !text.value.trim();
  $("translate").setAttribute("aria-busy", String(translating));
  model.disabled = busy || pickerModels().length < 2;
  $("stage-model").disabled = busy;
  device.disabled = busy || !state.gpu_available;
  $("history-list").inert = translating || deletingHistory;
  $("new-translation").disabled = $("mobile-new-translation").disabled = translating || !savedFrequentLanguage;
  for (const pane of panes.querySelectorAll(".result")) {
    const field = pane.querySelector("textarea");
    field.readOnly = translating;
    pane.querySelector(".copy-result").disabled = translating || !field.value.trim();
    const complete = resultLanguages.has(pane) && Boolean(field.value.trim());
    pane.querySelector(".retranslate-control").hidden = !complete;
    const disabled = busy || waitingForModel || !state.models.length || !complete;
    pane.querySelector(".retranslate").disabled = disabled;
    pane.querySelector(".retranslate-language").disabled = disabled;
  }
  $("count").textContent = `${text.value.length} / 4000`;
  const targetPicker = $("translate-language");
  targetPicker.disabled = $("translate").disabled;
  const targetName = target.selectedOptions[0]?.textContent;
  const targetLabel = t("翻訳先の言語");
  const pickerLabel = targetName ? `${targetLabel} · ${targetName}` : targetLabel;
  targetPicker.title = pickerLabel;
  targetPicker.setAttribute("aria-label", pickerLabel);
  $("edit-native-language").disabled = translating || !savedNativeLanguage;
  text.readOnly = $("context").readOnly = translating;
  activeGlossary.disabled = translating;
  form.hidden = $("form-label").hidden = savedNativeLanguage !== "ja";
  const canUseJapaneseForm = !form.hidden && (target.value === "ja" || target.value === "auto");
  form.disabled = translating || !canUseJapaneseForm;
}

const label = (id) => id.toUpperCase();
const modelLabel = (id) => `PLaMo ${label(id)}`;

function pickerModels(currentDevice = modelDraft?.device || state.preferred_device) {
  return state.models.filter((entry) => entry.installed && !entry.unavailable &&
    (!entry.gpu_required || currentDevice === "gpu")).map((entry) => entry.id);
}

function renderModelPicker() {
  const actualDevice = state.device || "cpu";
  const available = pickerModels();
  const selected = state.loading || state.active;
  const active = installedModels.includes(selected) ? selected : null;
  const usingGpu = (modelDraft?.device || state.preferred_device) === "gpu";
  $("model-gpu-indicator").toggleAttribute("hidden", actualDevice !== "gpu" || !active);
  device.setAttribute("aria-pressed", String(usingGpu));
  device.title = usingGpu ? t("CPUに切り替える") :
    state.gpu_available ? t("GPUに切り替える") : t("GPUを利用できません");
  feedback("device-note",
    modelDraft && (modelDraft.model !== modelDraft.initialModel || modelDraft.device !== modelDraft.initialDevice)
      ? t("パネルを閉じると変更を適用します。")
      : state.gpu_available ? (actualDevice === "gpu" ? t("GPUを使用中") : t("CPUを使用中")) : t("GPU未検出"));
  const draft = modelDraft?.model;
  const preview = available.includes(draft) ? draft : available.includes(active) ? active : available[0];
  const placeholder = installedModels.length ? t("モデルを選択") : t("モデルなし");
  $("model-label").textContent = active ? modelLabel(active) : placeholder;
  $("model-panel-label").textContent = preview ? modelLabel(preview) : placeholder;
  $("model-scale").hidden = !available.length;
  $("stage-model").hidden = !preview || Boolean(active || modelDraft?.model);
  model.max = Math.max(0, available.length - 1);
  model.value = Math.max(0, available.indexOf(preview));
  model.setAttribute("aria-valuetext", preview ? modelLabel(preview) : placeholder);
  model.style.setProperty("--model-progress", `${Number(model.max) ? 100 * model.valueAsNumber / Number(model.max) : 0}%`);
  const ticks = $("model-ticks");
  if (ticks.dataset.models !== available.join()) {
    ticks.dataset.models = available.join();
    ticks.replaceChildren(...available.map((id, index) => {
      const tick = document.createElement("span");
      tick.textContent = label(id);
      tick.style.setProperty("--tick-position", `${100 * index / Math.max(1, available.length - 1)}%`);
      return tick;
    }));
  }
}

function renderModels() {
  installedModels = pickerModels(state.preferred_device);
  renderModelPicker();
  const error = state.loading ? "" : state.error || "";
  feedback("status", error, Boolean(error));

  for (const entry of [...state.models].reverse()) {
    if (!rows.has(entry.id)) {
      const row = document.createElement("div");
      row.className = "model-row";
      const details = document.createElement("div");
      details.className = "model-row-details";
      const title = document.createElement("strong");
      title.textContent = `PLaMo Translate ${label(entry.id)}`;
      const size = document.createElement("span");
      size.textContent = t("約{0}GB", entry.size);
      const status = document.createElement("small");
      const progress = document.createElement("progress");
      progress.setAttribute("aria-label", t("{0}のダウンロード進捗", label(entry.id)));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-download";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path/></svg>';
      const check = document.createElement("span");
      check.className = "model-installed";
      check.setAttribute("role", "img");
      check.setAttribute("aria-label", t("取得済み"));
      check.textContent = "✓";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "model-delete";
      remove.title = t("削除");
      remove.setAttribute("aria-label", t("PLaMo Translate {0}を削除", label(entry.id)));
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/></svg>';
      remove.addEventListener("click", async () => {
        const name = `PLaMo Translate ${label(entry.id)}`;
        if (!(await confirmAction(t("モデルを削除しますか？"),
          t("{0}を保存先から削除します。使うには再ダウンロードが必要です。", name), t("削除する")))) return;
        if (translating || selecting) return;
        selecting = true;
        updateControls();
        remove.disabled = true;
        try {
          await api(`models/${entry.id}`, "DELETE");
          await refresh();
          feedback("download-feedback", t("{0}を削除しました。", name));
        } catch (error) {
          feedback("download-feedback", error.message, true);
        } finally {
          selecting = false;
          updateControls();
          remove.disabled = false;
        }
      });
      button.addEventListener("click", async () => {
        if (selecting) return;
        const running = button.dataset.running === "true";
        if (running && !(await confirmAction(t("ダウンロードを中止しますか？"),
          t("{0}の途中まで取得したデータを削除します。", label(entry.id)), t("中止する")))) return;
        button.disabled = true;
        feedback("download-feedback", "");
        try {
          if (running) {
            await api(`downloads/${entry.id}`, "DELETE");
          } else {
            await api(`models/${entry.id}/download`, "PUT");
          }
          await refresh();
        } catch (error) {
          feedback("download-feedback", error.message, true);
          button.disabled = false;
        }
      });
      details.append(title, size, status, progress);
      const actions = document.createElement("div");
      actions.className = "model-row-actions";
      const recommendation = document.createElement("span");
      recommendation.className = "model-recommendation";
      recommendation.textContent = t("おすすめ");
      actions.append(check, remove, recommendation, button);
      row.append(details, actions);
      $("model-list").append(row);
      rows.set(entry.id, { row, status, progress, button, check, remove, recommendation });
    }
    const { row, status, progress, button, check, remove, recommendation } = rows.get(entry.id);
    row.classList.toggle("model-row-unavailable", Boolean(entry.unavailable));
    recommendation.hidden = entry.installed || entry.id !== (state.gpu_available ? "2b" : "0.8b");
    const download = entry.download;
    const running = Boolean(download?.running);
    const received = Math.floor((download?.received || 0) / 1e6);
    const requirement = entry.unavailable ||
      (entry.gpu_required && state.preferred_device === "cpu" ? t("31Bの翻訳にはGPUへの切り替えが必要です。") : "");
    const downloadMessage = running ? t("ダウンロード中 · {0}MB", received) : download?.error;
    const message = [downloadMessage, requirement].filter(Boolean).join(" ");
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle("error", Boolean(download?.error));
    progress.hidden = !running;
    if (running && download.total) {
      progress.max = download.total;
      progress.value = download.received;
    } else {
      progress.removeAttribute("value");
    }
    button.hidden = entry.installed;
    check.hidden = !entry.installed;
    remove.hidden = !entry.installed;
    button.disabled = !running && Boolean(entry.unavailable);
    button.dataset.running = String(running);
    const action = running ? t("ダウンロードを中止") : download?.error ? t("ダウンロードを再試行") : t("ダウンロード");
    button.title = action;
    button.setAttribute("aria-label", t("{0}の{1}", modelLabel(entry.id), action));
    button.querySelector("path").setAttribute("d", running ? "M7 7h10v10H7z" : "M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4");
  }
  updateControls();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    state = await api("models");
    renderModels();
  } catch {
    feedback("status", t("モデルの状態を取得できませんでした。"), true);
  } finally {
    refreshing = false;
  }
}

function openModelManager() {
  manager.showModal();
  refresh();
}

const chooseModelFile = $("choose-model-file");
chooseModelFile.addEventListener("click", () => $("import-model").click());
$("import-model").addEventListener("change", async ({ currentTarget }) => {
  const file = currentTarget.files[0];
  if (!file || translating || selecting) return;
  selecting = true;
  updateControls();
  chooseModelFile.disabled = true;
  feedback("download-feedback", t("モデルを取り込み中…"));
  try {
    const { importModel } = await import("./browser-api.js");
    await importModel(file);
    await refresh();
    feedback("download-feedback", t("モデルを取り込みました。"));
  } catch (error) {
    feedback("download-feedback", error.message, true);
  } finally {
    selecting = false;
    updateControls();
    chooseModelFile.disabled = false;
    currentTarget.value = "";
  }
});

$("manage").addEventListener("click", openModelManager);
$("open-model-manager").addEventListener("click", openModelManager);
async function select(path) {
  selecting = true;
  warmupRequest++;
  let changed = false;
  updateControls();
  feedback("feedback", "");
  try {
    await api(path, "PUT");
    changed = true;
  } catch (error) {
    feedback("feedback", error.message, true);
  } finally {
    await refresh();
    selecting = false;
    updateControls();
    if (changed) warmVisibleTab();
  }
}

function stageModel() {
  if (!modelDraft) return;
  modelDraft.model = pickerModels()[model.valueAsNumber];
  renderModelPicker();
  updateControls();
}

model.addEventListener("input", stageModel);
$("stage-model").addEventListener("click", stageModel);
device.addEventListener("click", () => {
  if (!modelDraft) return;
  modelDraft.device = modelDraft.device === "gpu" ? "cpu" : "gpu";
  const available = pickerModels();
  if (!available.includes(modelDraft.model)) modelDraft.model = available[0] ?? null;
  renderModelPicker();
  updateControls();
});

modelPicker.addEventListener("toggle", async () => {
  if (modelPicker.open) {
    const model = state.loading || state.active;
    const device = state.preferred_device || "cpu";
    modelDraft = { model, device, initialModel: model, initialDevice: device };
  } else if (modelDraft) {
    const draft = modelDraft;
    modelDraft = null;
    const deviceChanged = draft.device !== draft.initialDevice;
    if (draft.model && (draft.model !== draft.initialModel || deviceChanged)) {
      await select(`models/${draft.model}/select?device=${draft.device}`);
    } else if (deviceChanged) {
      await select(`device/${draft.device}`);
    }
  }
  renderModelPicker();
  updateControls();
});
function glossary() {
  const terms = [];
  for (const [index, row] of Array.from($("glossary").children).entries()) {
    const [original, translation, enabled] = row.querySelectorAll("input");
    const source = original.value.trim();
    const target = translation.value.trim();
    const bidirectional = row.querySelector(".term-direction").getAttribute("aria-pressed") === "true";
    if (!source && !target) continue;
    if (!source || !target) {
      throw new Error(t("用語集の{0}行目の両方の欄に用語を入力してください。", index + 1));
    }
    terms.push({ source, target, enabled: enabled.checked, bidirectional });
  }
  return terms;
}

function addGlossaryRow(term = {}) {
  const row = $("glossary-row").content.firstElementChild.cloneNode(true);
  const [original, translation, enabled] = row.querySelectorAll("input");
  original.value = term.source || "";
  translation.value = term.target || "";
  enabled.checked = term.enabled !== false;
  const direction = row.querySelector(".term-direction");
  direction.setAttribute("aria-label", t("双方向に適用"));
  direction.title = t("双方向に適用");
  function setDirection(bidirectional) {
    direction.setAttribute("aria-pressed", String(bidirectional));
    direction.firstElementChild.textContent = bidirectional ? "↔" : "→";
    row.querySelector(".term-first span").textContent = t(bidirectional ? "用語1" : "原語");
    row.querySelector(".term-second span").textContent = t(bidirectional ? "用語2" : "訳語");
  }
  setDirection(term.bidirectional === true);
  direction.addEventListener("click", () => setDirection(direction.getAttribute("aria-pressed") === "false"));
  row.querySelector(".term-actions button").addEventListener("click", async () => {
    if ((original.value.trim() || translation.value.trim()) &&
        !(await confirmAction(t("この用語を削除しますか？"),
          t("入力した2つの用語を編集欄から取り除きます。"), t("削除する")))) return;
    row.remove();
    updateGlossaryRows();
  });
  $("glossary").append(row);
  updateGlossaryRows();
}

function updateGlossaryRows() {
  const count = $("glossary").childElementCount;
  $("glossary-term-count").textContent = t("{0} / 20行", count);
  $("add-term").disabled = count >= 20;
}

function selectedGlossaries() {
  return glossaryPresets.filter((preset) => selectedGlossaryIds.has(preset.id));
}

function saveTranslationOptions() {
  try {
    localStorage.setItem(translationOptionsKey, JSON.stringify({
      glossaryIds: [...selectedGlossaryIds],
      form: form.value,
    }));
  } catch {
    feedback("feedback", t("翻訳設定を保存できませんでした。"), true);
  }
}

function selectedTerms() {
  const terms = new Map();
  const reversed = [];
  function addTerm(source, target) {
    const existing = terms.get(source);
    if (existing && existing.target !== target) {
      throw new Error(t("「{0}」に異なる訳語が指定されています。適用する用語集を見直してください。", source));
    }
    terms.set(source, { source, target });
  }
  for (const preset of selectedGlossaries()) {
    for (const term of preset.terms) {
      if (term.enabled === false) continue;
      addTerm(term.source, term.target);
      if (term.bidirectional) reversed.push(term);
    }
  }
  if (terms.size > 20) throw new Error(t("適用する用語は合計20組までです。用語集の選択を減らしてください。"));
  for (const { source, target } of reversed) addTerm(target, source);
  return Array.from(terms.values());
}

function renderGlossaryOptions() {
  $("export-glossaries").disabled = !glossaryPresets.length;
  renderGlossaryPresets();
  const choices = $("glossary-choices");
  choices.replaceChildren();
  if (!glossaryPresets.length) choices.textContent = t("保存した用語集はここに表示されます。");
  for (const preset of glossaryPresets) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = preset.id;
    checkbox.checked = selectedGlossaryIds.has(preset.id);
    label.append(checkbox, preset.name);
    choices.append(label);
  }
  updateControls();
}

function renderGlossaryPresets() {
  const select = $("glossary-presets");
  const placeholder = new Option(t(glossaryPresets.length ? "用語集を選択" : "保存済みの用語集はありません。"), "");
  placeholder.disabled = true;
  select.replaceChildren(placeholder);
  for (const preset of glossaryPresets) {
    select.add(new Option(preset.name, preset.id));
  }
  select.value = glossaryPresets.some((preset) => preset.id === editingGlossaryId) ? editingGlossaryId : "";
  select.disabled = !glossaryPresets.length;
}

function openGlossaryEditor(id) {
  const preset = glossaryPresets.find((item) => item.id === id);
  editingGlossaryId = preset?.id || "";
  renderGlossaryPresets();
  $("glossary-editor-title").textContent = preset ? t("用語集を編集") : t("新しい用語集");
  $("glossary-name").value = preset?.name || "";
  $("glossary").replaceChildren();
  for (const term of preset?.terms || [{}]) addGlossaryRow(term);
  $("delete-glossary").disabled = !preset;
  feedback("glossary-feedback", "");
}

async function loadGlossaries() {
  glossaryPresets = await api("glossaries");
  renderGlossaryOptions();
}

$("add-term").addEventListener("click", () => addGlossaryRow());
$("create-glossary").addEventListener("click", () => openGlossaryEditor(""));
$("glossary-presets").addEventListener("change", (event) => openGlossaryEditor(event.currentTarget.value));
async function showGlossaryEditor(createNew) {
  const editor = $("glossary-form");
  editor.inert = true;
  $("glossary-dialog").showModal();
  try {
    await loadGlossaries();
    openGlossaryEditor(createNew ? "" : selectedGlossaries()[0]?.id || glossaryPresets[0]?.id);
  } catch (error) {
    feedback("glossary-feedback", error.message, true);
  } finally {
    editor.inert = false;
  }
}

$("manage-glossaries").addEventListener("click", () => showGlossaryEditor(false));
$("new-glossary").addEventListener("click", () => showGlossaryEditor(true));

async function changeGlossary(method, id, payload) {
  const editor = $("glossary-form");
  const button = $(method === "PUT" ? "save-glossary" : "delete-glossary");
  editor.inert = true;
  button.setAttribute("aria-busy", "true");
  feedback("glossary-feedback", "");
  try {
    const [result] = await Promise.all([
      api(`glossaries/${id}`, method, payload),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
    glossaryPresets = glossaryPresets.filter((preset) => preset.id !== id);
    if (method === "PUT") glossaryPresets.push(result);
    else if (selectedGlossaryIds.delete(id)) saveTranslationOptions();
    renderGlossaryOptions();
    openGlossaryEditor(method === "PUT" ? id : glossaryPresets[0]?.id);
    feedback("glossary-feedback", method === "PUT" ? t("保存しました") : t("削除しました"));
  } catch (error) {
    feedback("glossary-feedback", error.message, true);
  } finally {
    button.setAttribute("aria-busy", "false");
    editor.inert = false;
  }
}

$("glossary-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const name = $("glossary-name").value.trim();
    const terms = glossary();
    if (!name || !terms.length) throw new Error(t("名前と用語を1組以上入力してください。"));
    changeGlossary("PUT", editingGlossaryId || crypto.randomUUID(), { name, terms });
  } catch (error) {
    feedback("glossary-feedback", error.message, true);
  }
});
$("delete-glossary").addEventListener("click", async () => {
  const preset = glossaryPresets.find((item) => item.id === editingGlossaryId);
  if (preset && await confirmAction(t("用語集を削除しますか？"),
    t("「{0}」と登録されている用語を削除します。", preset.name), t("削除する"))) {
    changeGlossary("DELETE", preset.id);
  }
});

$("export-glossaries").addEventListener("click", () => {
  const presets = glossaryPresets.map(({ name, terms }) => ({ name, terms }));
  const file = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "glossaries.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("import-glossaries").addEventListener("click", () => $("glossary-file").click());
$("glossary-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  const editor = $("glossary-form");
  editor.inert = true;
  try {
    const presets = JSON.parse(await file.text());
    const imported = await api("glossaries/import", "POST", presets);
    glossaryPresets.push(...imported);
    renderGlossaryOptions();
    feedback("glossary-feedback", t("{0}件の用語集を追加しました。", imported.length));
  } catch (error) {
    feedback("glossary-feedback", error instanceof SyntaxError ? t("JSONファイルを読み込めませんでした。") : error.message, true);
  } finally {
    editor.inert = false;
  }
});

document.addEventListener("click", (event) => {
  if (modelPicker.open && !modelPicker.contains(event.target) &&
      !manager.contains(event.target) &&
      !$("confirm-action").contains(event.target)) modelPicker.open = false;
  if (translationSettings.open && !translationSettings.contains(event.target) &&
      !$("glossary-dialog").contains(event.target)) {
    translationSettings.open = false;
  }
});

$("translation").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("translate").disabled) return;
  historyRestoreRequest++;
  if (!installedModels.length) {
    await promptModelDownload();
    return;
  }
  translationSettings.open = false;
  modelPicker.open = false;
  translating = true;
  const japaneseForm = form.disabled ? "" : form.value;
  output.value = "";
  resetResults();
  if (singlePane.matches) {
    if (document.activeElement === text) text.blur();
    showPanes(1, "instant");
  }
  feedback("feedback", t(displayedWarmup ? "モデルを読み込み中…" : "翻訳中…"));
  updateControls();
  try {
    const automatic = target.value === "auto";
    const terms = selectedTerms();
    const started = performance.now();
    const result = await translateStream({
      text: text.value, source: source.value, target: automatic ? savedNativeLanguage : target.value,
      ...(automatic && { frequent_language: savedFrequentLanguage }),
      context: $("context").value, glossary: terms, form: japaneseForm, save_history: true,
    }, (fragment) => updateStreamText(output, output.value + fragment));
    firstResult.querySelector(".elapsed").textContent = t("翻訳時間 {0}秒", ((performance.now() - started) / 1000).toFixed(2));
    updateStreamText(output, result.text);
    setResultLanguages(firstResult, result);
    currentHistoryId = result.history_id || null;
    const notices = [
      result.truncated && t("出力上限に達しました。原文を分けて再翻訳してください。"),
      result.history_error,
    ].filter(Boolean);
    feedback("feedback", notices.join(" "), Boolean(result.history_error));
    if (result.text && !result.history_error) loadHistory();
  } catch (error) {
    feedback("feedback", error.message, true);
  } finally {
    translating = false;
    updateControls();
  }
});

function setResultLanguages(pane, { source: from, target: to, truncated = false }) {
  resultLanguages.set(pane, { source: from, target: to, truncated });
}

function retranslationLanguages(currentLanguage) {
  return Array.from(target.options).filter((option) => option.value !== "auto" && option.value !== currentLanguage);
}

function prepareRetranslationMenu(button, pane) {
  const menu = $("retranslate-menu");
  const rect = button.getBoundingClientRect();
  const width = Math.min(224, window.innerWidth - 24);
  const above = rect.top - 18;
  const below = window.innerHeight - rect.bottom - 18;
  const openAbove = above >= 180 || above >= below;
  menu.style.width = `${width}px`;
  menu.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
  menu.style.top = openAbove ? "auto" : `${rect.bottom + 6}px`;
  menu.style.bottom = openAbove ? `${window.innerHeight - rect.top + 6}px` : "auto";
  menu.style.maxHeight = `${Math.min(320, openAbove ? above : below)}px`;
  $("retranslate-options").replaceChildren(...(pane ? retranslationLanguages(resultLanguages.get(pane).target) : Array.from(target.options)).map((language) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = language.textContent;
    if (!pane && language.selected) option.setAttribute("aria-current", "true");
    option.addEventListener("click", () => {
      menu.hidePopover();
      if (button.disabled) return;
      if (pane) {
        if (pane.isConnected) retranslate(pane, language.value);
      } else {
        const previousTarget = target.value;
        target.value = language.value;
        updateControls();
        $("translation").requestSubmit($("translate"));
        target.value = previousTarget;
        updateControls();
      }
    });
    return option;
  }));
}

$("translate-language").addEventListener("click", (event) => prepareRetranslationMenu(event.currentTarget));

function addResultPane(previous, result) {
  const pane = firstResult.cloneNode(true);
  pane.querySelector(".copy-result").classList.remove("copied");
  pane.classList.add("retranslation-result");
  const field = pane.querySelector("textarea");
  field.id = `retranslation-${++resultNumber}`;
  field.value = result.text || "";
  const label = pane.querySelector("label");
  label.htmlFor = field.id;
  label.textContent = t("再翻訳");
  pane.querySelector(".elapsed").textContent = "";
  previous.after(pane);
  setResultLanguages(pane, result);
  return pane;
}

async function saveCurrentChain() {
  if (!currentHistoryId) return;
  const results = Array.from(panes.querySelectorAll(".result"), (pane) => ({
    ...resultLanguages.get(pane),
    text: pane.querySelector("textarea").value,
  }));
  await api(`history/${encodeURIComponent(currentHistoryId)}/chain`, "PUT", { results });
}

async function retranslate(pane, selectedLanguage) {
  if (!installedModels.length) {
    await promptModelDownload();
    return;
  }
  const { source: detectedLanguage, target: translatedLanguage } = resultLanguages.get(pane);
  const languages = retranslationLanguages(translatedLanguage);
  const available = (language) => Boolean(language) &&
    languages.some((option) => option.value === language);
  const destination = selectedLanguage || (available(detectedLanguage) ? detectedLanguage :
    pane === firstResult && available(source.value) ? source.value : "");
  if (!destination) {
    feedback("feedback", t("「再翻訳」の右にある言語ボタンから翻訳先を選んでください。"), true);
    return;
  }
  const original = pane.querySelector("textarea").value;
  const next = addResultPane(pane, { source: translatedLanguage, target: destination });
  resultLanguages.delete(next);
  const field = next.querySelector("textarea");
  const elapsed = next.querySelector(".elapsed");
  translating = true;
  showPanes(Array.from(panes.children).indexOf(next) - (singlePane.matches ? 0 : 1),
    singlePane.matches ? "instant" : "auto");
  feedback("feedback", t(displayedWarmup ? "モデルを読み込み中…" : "再翻訳中…"));
  updateControls();
  try {
    const started = performance.now();
    const result = await translateStream({
      text: original, source: translatedLanguage, target: destination,
      context: $("context").value,
      glossary: selectedTerms(),
      form: destination === "ja" && !form.hidden ? form.value : "",
    }, (fragment) => updateStreamText(field, field.value + fragment));
    updateStreamText(field, result.text);
    setResultLanguages(next, result);
    elapsed.textContent = t("翻訳時間 {0}秒", ((performance.now() - started) / 1000).toFixed(2));
    await saveCurrentChain();
    feedback("feedback", result.truncated ? t("再翻訳が出力上限に達しました。") : "");
  } catch (error) {
    if (!field.value) {
      next.remove();
      showPanes(firstVisiblePane);
    }
    feedback("feedback", error.message, true);
  } finally {
    translating = false;
    updateControls();
  }
}

panes.addEventListener("input", (event) => {
  if (event.target.matches(".result textarea")) {
    clearCopied(event.target.closest(".result"));
    updateControls();
  }
});

$("translation").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.ctrlKey && !event.isComposing && !event.repeat) {
    event.preventDefault();
    if (!$("translate").disabled) $("translation").requestSubmit();
  }
});

function restoreHistory(entry) {
  text.value = entry.original;
  output.value = entry.text;
  source.value = entry.source_selection;
  target.value = Array.from(target.options).some((option) => option.value === entry.target_selection)
    ? entry.target_selection
    : "auto";
  resetResults();
  currentHistoryId = entry.id;
  const originalLanguage = entry.source_selection === "auto" && entry.source === "zh-hans"
    ? "zh"
    : entry.source;
  setResultLanguages(firstResult, { ...entry, source: originalLanguage });
  let previous = firstResult;
  for (const result of entry.retranslations || []) {
    previous = addResultPane(previous, result);
  }
  showPanes(0, "instant");
  feedback("feedback", entry.truncated ? t("この訳文は出力上限で途中まで表示されています。") : "");
  updateControls();
}

function updateHistoryEditing() {
  const menu = $("history-edit-menu");
  if (!editingHistory || deletingHistory) menu.hidden = true;
  $("history-list").toggleAttribute("data-editing", editingHistory);
  $("edit-history").setAttribute("aria-pressed", String(editingHistory));
  $("edit-history").setAttribute("aria-expanded", String(!menu.hidden));
  $("edit-history").title = editingHistory ? t("履歴の編集メニュー") : t("履歴を編集");
  $("edit-history").disabled = deletingHistory;
  $("delete-history").hidden = !editingHistory;
  $("delete-history").disabled = deletingHistory || !selectedHistory.size;
  $("delete-all-history").disabled = !$("history-list").childElementCount;
}

function closeHistoryEditing() {
  editingHistory = false;
  selectedHistory.clear();
  for (const checkbox of $("history-list").querySelectorAll("input:checked")) checkbox.checked = false;
  updateHistoryEditing();
}

$("edit-history").addEventListener("click", () => {
  if (editingHistory) {
    $("history-edit-menu").hidden = !$("history-edit-menu").hidden;
  } else {
    editingHistory = true;
  }
  updateHistoryEditing();
});

$("close-history-edit").addEventListener("click", closeHistoryEditing);
document.addEventListener("click", (event) => {
  if (editingHistory && !deletingHistory &&
      !event.target.closest(".sidebar-history, #confirm-action")) closeHistoryEditing();
});

async function deleteHistory(ids) {
  if (!ids.length || !(await confirmAction(t("翻訳履歴を削除しますか？"),
    t("{0}件の履歴を削除します。", ids.length), t("削除する")))) return;
  deletingHistory = true;
  updateHistoryEditing();
  updateControls();
  try {
    await api("history", "DELETE", { ids });
    closeHistoryEditing();
    await loadHistory();
  } catch (error) {
    feedback("history-feedback", error.message, true);
  } finally {
    deletingHistory = false;
    updateHistoryEditing();
    updateControls();
  }
}

$("delete-history").addEventListener("click", () => deleteHistory([...selectedHistory]));
$("delete-all-history").addEventListener("click", () => {
  $("history-edit-menu").hidden = true;
  updateHistoryEditing();
  deleteHistory(Array.from($("history-list").querySelectorAll(".history-select"), (checkbox) => checkbox.value));
});

async function loadHistory() {
  const request = ++historyRequest;
  const list = $("history-list");
  feedback("history-feedback", t("履歴を読み込み中…"));
  try {
    const entries = await api("history");
    if (request !== historyRequest) return;
    const ids = new Set(entries.map((entry) => entry.id));
    for (const id of selectedHistory) {
      if (!ids.has(id)) selectedHistory.delete(id);
    }
    list.replaceChildren();
    feedback("history-feedback", entries.length ? "" : t("翻訳履歴はありません。"));
    for (const { id, title } of entries) {
      const row = $("history-entry").content.firstElementChild.cloneNode(true);
      const open = row.querySelector(".history-restore");
      open.textContent = title;
      open.title = title;
      const checkbox = row.querySelector(".history-select");
      checkbox.value = id;
      checkbox.checked = selectedHistory.has(id);
      checkbox.setAttribute("aria-label", t("「{0}」を選択", title));
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedHistory.add(id);
        else selectedHistory.delete(id);
        updateHistoryEditing();
      });
      open.addEventListener("click", async () => {
        if (editingHistory) {
          checkbox.click();
          return;
        }
        const restoreRequest = ++historyRestoreRequest;
        try {
          const entry = await api(`history/${encodeURIComponent(id)}`);
          if (restoreRequest === historyRestoreRequest && row.isConnected &&
              !editingHistory && !translating && !deletingHistory) {
            restoreHistory(entry);
          }
        } catch (error) {
          if (restoreRequest === historyRestoreRequest && row.isConnected) {
            feedback("history-feedback", error.message, true);
          }
        }
      });
      list.append(row);
    }
    updateHistoryEditing();
  } catch (error) {
    if (request === historyRequest) feedback("history-feedback", error.message, true);
  }
}

function clearCopied(pane) {
  const button = pane.querySelector(".copy-result");
  clearTimeout(copyTimers.get(button));
  copyTimers.delete(button);
  button.classList.remove("copied");
}

panes.addEventListener("click", async (event) => {
  const button = event.target.closest(".retranslate, .retranslate-language, .copy-result");
  if (!button) return;
  const pane = button.closest(".result");
  if (button.matches(".retranslate-language")) {
    prepareRetranslationMenu(button, pane);
    return;
  }
  if (button.matches(".retranslate")) {
    await retranslate(pane);
    return;
  }
  const field = pane.querySelector("textarea");
  const value = field.value;
  try {
    await navigator.clipboard.writeText(value);
    if (!field.isConnected || field.value !== value || translating) return;
    clearCopied(pane);
    button.classList.add("copied");
    copyTimers.set(button, setTimeout(() => clearCopied(pane), 5000));
    feedback("feedback", t("訳文をコピーしました。"));
  } catch {
    if (!field.isConnected || field.value !== value || translating) return;
    field.select();
    feedback("feedback", t("自動でコピーできませんでした。選択した訳文をコピーしてください。"), true);
  }
});

for (const element of [text, source, target, form, activeGlossary]) {
  element.addEventListener("input", updateControls);
}
activeGlossary.addEventListener("change", () => {
  selectedGlossaryIds = new Set(Array.from(activeGlossary.querySelectorAll("input:checked"), (input) => input.value));
  saveTranslationOptions();
});
form.addEventListener("change", saveTranslationOptions);

function openNativeLanguage() {
  nativeLanguage.value = savedNativeLanguage || preferredLocale || "en";
  frequentLanguage.value = savedFrequentLanguage || (nativeLanguage.value === "en" ? "ja" : "en");
  $("cancel-native-language").hidden = !savedFrequentLanguage;
  feedback("native-language-feedback", "");
  nativeLanguageDialog.showModal();
}

$("edit-native-language").addEventListener("click", openNativeLanguage);
$("cancel-native-language").addEventListener("click", () => nativeLanguageDialog.close());
nativeLanguageDialog.addEventListener("cancel", (event) => {
  if (!savedFrequentLanguage) event.preventDefault();
});
$("native-language-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (nativeLanguage.value === frequentLanguage.value) {
    feedback("native-language-feedback", t("よく使う言語には、自分の言語と異なる言語を選んでください。"), true);
    return;
  }
  try {
    localStorage.setItem(nativeLanguageKey, nativeLanguage.value);
    localStorage.setItem(frequentLanguageKey, frequentLanguage.value);
  } catch {
    feedback("native-language-feedback", t("翻訳先の設定を保存できませんでした。ブラウザーのサイトデータ設定を確認してください。"), true);
    return;
  }
  savedNativeLanguage = nativeLanguage.value;
  savedFrequentLanguage = frequentLanguage.value;
  target.value = "auto";
  nativeLanguageDialog.close();
  updateControls();
});

async function init() {
  try {
    const options = JSON.parse(localStorage.getItem(translationOptionsKey));
    if (Array.isArray(options?.glossaryIds)) selectedGlossaryIds = new Set(options.glossaryIds);
    if (["plain", "polite"].includes(options?.form)) form.value = options.form;
  } catch {
    // 保存した設定を読み込めない場合は既定値を使う
  }
  try {
    const languages = await api("languages");
    source.add(new Option(t("自動判定"), "auto"));
    target.add(new Option(t("自動切り替え"), "auto"));
    const languageNames = new Intl.DisplayNames(uiLocale, { type: "language", fallback: "none" });
    for (const [code, japaneseName] of Object.entries(languages)) {
      const name = uiLocale === "ja" ? japaneseName : languageNames.of(code) ?? code;
      source.add(new Option(name, code));
      target.add(new Option(name, code));
      nativeLanguage.add(new Option(name, code));
      frequentLanguage.add(new Option(name, code));
    }
    source.value = "auto";
    let saved;
    let frequent;
    try {
      saved = localStorage.getItem(nativeLanguageKey);
      frequent = localStorage.getItem(frequentLanguageKey);
    } catch {
      saved = null;
    }
    if (saved && Object.hasOwn(languages, saved)) {
      savedNativeLanguage = saved;
    }
    if (savedNativeLanguage && frequent && frequent !== savedNativeLanguage && Object.hasOwn(languages, frequent)) {
      savedFrequentLanguage = frequent;
    } else {
      openNativeLanguage();
    }
  } catch {
    feedback("feedback", t("言語一覧を取得できませんでした。ページを再読み込みしてください。"), true);
  }
  await refresh();
  loadHistory();
  loadGlossaries().catch((error) => feedback("feedback", error.message, true));
  setInterval(refresh, 1500);

  if (nativeLanguageDialog.open) {
    await new Promise((resolve) => nativeLanguageDialog.addEventListener("close", resolve, { once: true }));
  }
  if (!state.models.some((entry) => entry.download?.running)) await promptModelDownload();
}

async function promptModelDownload() {
  const starterModel = state.models.find((entry) => entry.id === "0.8b");
  if (!starterModel || installedModels.length) return;
  if (state.models.some((entry) => entry.download?.running)) {
    openModelManager();
    return;
  }
  if (!(await confirmAction(t("翻訳用モデルをダウンロード（{0}GB）", starterModel.size),
    t("最も小さい翻訳用モデルをブラウザに保存します。\n保存したモデルは「モデル管理」から削除できます。"),
    t("ダウンロード"), false))) return;

  manager.showModal();
  feedback("download-feedback", "");
  try {
    await api("models/0.8b/download", "PUT");
    await refresh();
  } catch (error) {
    feedback("download-feedback", error.message, true);
  }
}

init();
