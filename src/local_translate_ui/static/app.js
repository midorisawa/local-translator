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
  themeToggle.title = dark ? "ライトモードに切り替える" : "ダークモードに切り替える";
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
let editingHistory = false;
let deletingHistory = false;
const selectedHistory = new Set();

function fitPanesToViewport() {
  const main = panes.closest("main");
  const padding = getComputedStyle(main);
  const top = main.getBoundingClientRect().top + window.scrollY;
  const limit = Math.max(208, window.innerHeight - top -
    parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - 2);
  panes.style.setProperty("--pane-limit", `${limit}px`);
}

const layoutObserver = new ResizeObserver(fitPanesToViewport);
layoutObserver.observe(document.querySelector(".sidebar"));
layoutObserver.observe($("mobile-sidebar-toggle"));
window.addEventListener("resize", fitPanesToViewport);
singlePane.addEventListener("change", () => showPanes(firstVisiblePane, "instant"));

const mobileSidebarToggle = $("mobile-sidebar-toggle");
function setMobileSidebar(expanded) {
  mobileSidebarToggle.setAttribute("aria-expanded", String(expanded));
  mobileSidebarToggle.setAttribute("aria-label", expanded ? "サイドバーを閉じる" : "サイドバーを開く");
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
  panes.scrollTo({ left: paneWidth * firstVisiblePane, behavior });
  updatePaneNavigation();
}

panes.addEventListener("scrollend", () => {
  const paneWidth = panes.firstElementChild.getBoundingClientRect().width;
  if (!paneWidth) return;
  firstVisiblePane = Math.min(lastPanePosition(), Math.round(panes.scrollLeft / paneWidth));
  updatePaneNavigation();
});
$("pane-previous").addEventListener("click", () => showPanes(firstVisiblePane - 1));
$("pane-next").addEventListener("click", () => showPanes(firstVisiblePane + 1));
showPanes(0);

function resetResults() {
  currentHistoryId = null;
  while (firstResult.nextElementSibling) firstResult.nextElementSibling.remove();
  firstResult.querySelector(".elapsed").textContent = "";
  resultLanguages.delete(firstResult);
  showPanes(0, "instant");
}

function startNewTranslation() {
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
  feedback("feedback", "");
  updateControls();
}

$("new-translation").addEventListener("click", startNewTranslation);
$("mobile-new-translation").addEventListener("click", startNewTranslation);

async function api(path, method = "GET", body) {
  const { browserApi } = await import("./browser-api.js");
  return browserApi(path, method, body);
}

async function translateStream(body, onFragment) {
  const { translateInBrowser } = await import("./webgpu.js");
  const { translationModel } = await import("./browser-api.js");
  const result = await translateInBrowser(
    body, onFragment, (message) => feedback("feedback", message), await translationModel(),
  );
  if (body.save_history && result.text) {
    try {
      const { records } = await import("./browser-records.js");
      const id = crypto.randomUUID();
      await records("history", (entries) => entries.unshift({
        ...result, id, created_at: new Date().toISOString(), original: body.text,
        source_selection: body.source, target_selection: body.frequent_language ? "auto" : body.target,
      }));
      result.history_id = id;
    } catch {
      result.history_error = "訳文は取得できましたが、履歴を保存できませんでした。";
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
  $("confirm-title").textContent = title;
  $("confirm-description").textContent = description;
  $("confirm-submit").textContent = action;
  $("confirm-submit").classList.toggle("danger", destructive);
  $("confirm-submit").classList.toggle("primary", !destructive);
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.showModal();
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
  model.disabled = busy || installedModels.length < 2;
  $("stage-model").disabled = busy;
  device.disabled = busy || !installedModels.length || !state.gpu_available;
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
  $("translate-language").disabled = $("translate").disabled;
  $("edit-native-language").disabled = translating || !savedNativeLanguage;
  text.readOnly = $("context").readOnly = translating;
  activeGlossary.disabled = translating;
  const canUseJapaneseForm = target.value === "ja" ||
    (target.value === "auto" && [savedNativeLanguage, savedFrequentLanguage].includes("ja"));
  form.disabled = translating || !canUseJapaneseForm;
}

const label = (id) => id.toUpperCase();
const modelLabel = (id) => `PLaMo ${label(id)}`;

function renderModelPicker() {
  const actualDevice = state.device || "cpu";
  const selected = state.loading || state.active;
  const active = installedModels.includes(selected) ? selected : null;
  const usingGpu = installedModels.length > 0 && (modelDraft?.device || actualDevice) === "gpu";
  $("model-gpu-indicator").toggleAttribute("hidden", actualDevice !== "gpu" || !active);
  device.setAttribute("aria-pressed", String(usingGpu));
  device.title = !installedModels.length ? "モデルなし" : usingGpu ? "CPUに切り替える" :
    state.gpu_available ? "GPUに切り替える" : "GPUを利用できません";
  feedback("device-note",
    !installedModels.length ? "" :
    modelDraft && (modelDraft.model !== modelDraft.initialModel || modelDraft.device !== modelDraft.initialDevice)
      ? "パネルを閉じると変更を適用します。"
      : state.gpu_available ? (usingGpu ? "GPUを使用中" : "CPUを使用中") : "GPU未検出");
  const draft = modelDraft?.model;
  const preview = installedModels.includes(draft) ? draft : active || installedModels[0];
  const placeholder = installedModels.length ? "モデルを選択" : "モデルなし";
  $("model-label").textContent = active ? modelLabel(active) : placeholder;
  $("model-panel-label").textContent = preview ? modelLabel(preview) : placeholder;
  $("model-scale").hidden = !installedModels.length;
  $("stage-model").hidden = !preview || Boolean(active || modelDraft?.model);
  model.max = Math.max(0, installedModels.length - 1);
  model.value = Math.max(0, installedModels.indexOf(preview));
  model.setAttribute("aria-valuetext", preview ? modelLabel(preview) : placeholder);
  model.style.setProperty("--model-progress", `${Number(model.max) ? 100 * model.valueAsNumber / Number(model.max) : 0}%`);
}

function renderModels() {
  const installed = state.models.filter((entry) => entry.installed).map((entry) => entry.id);
  if (installed.join() !== installedModels.join()) {
    installedModels = installed;
    $("model-ticks").replaceChildren(...installed.map((id, index) => {
      const tick = document.createElement("span");
      tick.textContent = label(id);
      tick.style.setProperty("--tick-position", `${100 * index / Math.max(1, installed.length - 1)}%`);
      return tick;
    }));
  }
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
      size.textContent = `約${entry.size}GB`;
      const status = document.createElement("small");
      const progress = document.createElement("progress");
      progress.setAttribute("aria-label", `${label(entry.id)}のダウンロード進捗`);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "model-download";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path/></svg>';
      const check = document.createElement("span");
      check.className = "model-installed";
      check.setAttribute("role", "img");
      check.setAttribute("aria-label", "取得済み");
      check.textContent = "✓";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "model-delete";
      remove.title = "削除";
      remove.setAttribute("aria-label", `PLaMo Translate ${label(entry.id)}を削除`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/></svg>';
      remove.addEventListener("click", async () => {
        const name = `PLaMo Translate ${label(entry.id)}`;
        if (!(await confirmAction("モデルを削除しますか？",
          `${name}を保存先から削除します。使うには再ダウンロードが必要です。`, "削除する"))) return;
        if ((translating || selecting)) return;
        remove.disabled = true;
        try {
          await api(`models/${entry.id}`, "DELETE");
          await refresh();
          feedback("download-feedback", `${name}を削除しました。`);
        } catch (error) {
          feedback("download-feedback", error.message, true);
        } finally {
          remove.disabled = false;
        }
      });
      button.addEventListener("click", async () => {
        if (selecting) return;
        const running = button.dataset.running === "true";
        if (running && !(await confirmAction("ダウンロードを中止しますか？",
          `${label(entry.id)}の途中まで取得したデータを削除します。`, "中止する"))) return;
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
      recommendation.textContent = "おすすめ";
      actions.append(check, remove, recommendation, button);
      row.append(details, actions);
      $("model-list").append(row);
      rows.set(entry.id, { status, progress, button, check, remove, recommendation });
    }
    const { status, progress, button, check, remove, recommendation } = rows.get(entry.id);
    recommendation.hidden = entry.installed || entry.id !== (state.gpu_available ? "2b" : "0.8b");
    const download = entry.download;
    const running = Boolean(download?.running);
    const received = Math.floor((download?.received || 0) / 1e6);
    const message = running ? `ダウンロード中 · ${received}MB` : download?.error || "";
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
    button.disabled = false;
    button.dataset.running = String(running);
    const action = running ? "ダウンロードを中止" : download?.error ? "ダウンロードを再試行" : "ダウンロード";
    button.title = action;
    button.setAttribute("aria-label", `${modelLabel(entry.id)}の${action}`);
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
    feedback("status", "モデルの状態を取得できませんでした。", true);
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
  feedback("download-feedback", "モデルを取り込み中…");
  try {
    const { importModel } = await import("./browser-api.js");
    await importModel(file);
    await refresh();
    feedback("download-feedback", "モデルを取り込みました。");
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
  updateControls();
  feedback("feedback", "");
  try {
    await api(path, "PUT");
  } catch (error) {
    feedback("feedback", error.message, true);
  } finally {
    await refresh();
    selecting = false;
    updateControls();
  }
}

function stageModel() {
  if (!modelDraft) return;
  modelDraft.model = installedModels[model.valueAsNumber];
  renderModelPicker();
  updateControls();
}

model.addEventListener("input", stageModel);
$("stage-model").addEventListener("click", stageModel);
device.addEventListener("click", () => {
  if (!modelDraft) return;
  modelDraft.device = modelDraft.device === "gpu" ? "cpu" : "gpu";
  renderModelPicker();
  updateControls();
});

modelPicker.addEventListener("toggle", async () => {
  if (modelPicker.open) {
    const model = state.loading || state.active;
    const device = state.device || "cpu";
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
    if (!source && !target) continue;
    if (!source || !target) {
      throw new Error(`用語集の${index + 1}行目に原語と訳語を入力してください。`);
    }
    terms.push({ source, target, enabled: enabled.checked });
  }
  return terms;
}

function addGlossaryRow(term = {}) {
  const row = $("glossary-row").content.firstElementChild.cloneNode(true);
  const [original, translation, enabled] = row.querySelectorAll("input");
  original.value = term.source || "";
  translation.value = term.target || "";
  enabled.checked = term.enabled !== false;
  row.querySelector("button").addEventListener("click", async () => {
    if ((original.value.trim() || translation.value.trim()) &&
        !(await confirmAction("この用語を削除しますか？",
          "入力した原語と訳語を編集欄から取り除きます。", "削除する"))) return;
    row.remove();
    updateGlossaryRows();
  });
  $("glossary").append(row);
  updateGlossaryRows();
}

function updateGlossaryRows() {
  const count = $("glossary").childElementCount;
  $("glossary-term-count").textContent = `${count} / 20行`;
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
    feedback("feedback", "翻訳設定を保存できませんでした。", true);
  }
}

function selectedTerms() {
  const terms = new Map();
  for (const preset of selectedGlossaries()) {
    for (const term of preset.terms) {
      if (term.enabled === false) continue;
      const existing = terms.get(term.source);
      if (existing && existing.target !== term.target) {
        throw new Error(`「${term.source}」に異なる訳語が指定されています。適用する用語集を見直してください。`);
      }
      terms.set(term.source, term);
    }
  }
  if (terms.size > 20) throw new Error("適用する用語は合計20組までです。用語集の選択を減らしてください。");
  return Array.from(terms.values());
}

function renderGlossaryOptions() {
  $("export-glossaries").disabled = !glossaryPresets.length;
  renderGlossaryPresets();
  const choices = $("glossary-choices");
  choices.replaceChildren();
  if (!glossaryPresets.length) choices.textContent = "保存した用語集はここに表示されます。";
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
  const list = $("glossary-presets");
  list.replaceChildren();
  if (!glossaryPresets.length) list.textContent = "保存済みの用語集はありません。";
  for (const preset of glossaryPresets) {
    const button = document.createElement("button");
    const name = document.createElement("span");
    const count = document.createElement("small");
    button.type = "button";
    button.setAttribute("aria-pressed", String(preset.id === editingGlossaryId));
    name.textContent = preset.name;
    count.textContent = `${preset.terms.filter((term) => term.enabled !== false).length}件が有効`;
    button.append(name, count);
    button.addEventListener("click", () => {
      if (editingGlossaryId !== preset.id) openGlossaryEditor(preset.id);
    });
    list.append(button);
  }
}

function openGlossaryEditor(id) {
  const preset = glossaryPresets.find((item) => item.id === id);
  editingGlossaryId = preset?.id || "";
  renderGlossaryPresets();
  $("glossary-editor-title").textContent = preset ? "用語集を編集" : "新しい用語集";
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
    feedback("glossary-feedback", method === "PUT" ? "保存しました" : "削除しました");
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
    if (!name || !terms.length) throw new Error("名前と用語を1組以上入力してください。");
    changeGlossary("PUT", editingGlossaryId || crypto.randomUUID(), { name, terms });
  } catch (error) {
    feedback("glossary-feedback", error.message, true);
  }
});
$("delete-glossary").addEventListener("click", async () => {
  const preset = glossaryPresets.find((item) => item.id === editingGlossaryId);
  if (preset && await confirmAction("用語集を削除しますか？",
    `「${preset.name}」と登録されている用語を削除します。`, "削除する")) {
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
    feedback("glossary-feedback", `${imported.length}件の用語集を追加しました。`);
  } catch (error) {
    feedback("glossary-feedback", error instanceof SyntaxError ? "JSONファイルを読み込めませんでした。" : error.message, true);
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
  feedback("feedback", "翻訳中…");
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
    firstResult.querySelector(".elapsed").textContent = `翻訳時間 ${((performance.now() - started) / 1000).toFixed(2)}秒`;
    updateStreamText(output, result.text);
    setResultLanguages(firstResult, result);
    currentHistoryId = result.history_id || null;
    const notices = [
      result.truncated && "出力上限に達しました。原文を分けて再翻訳してください。",
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
    option.addEventListener("click", () => {
      menu.hidePopover();
      if (button.disabled) return;
      if (pane) {
        if (pane.isConnected) retranslate(pane, language.value);
      } else {
        target.value = language.value;
        updateControls();
        $("translation").requestSubmit($("translate"));
        target.value = "auto";
        updateControls();
      }
    });
    return option;
  }));
}

$("translate-language").addEventListener("click", (event) => prepareRetranslationMenu(event.currentTarget));

function addResultPane(previous, result) {
  const pane = firstResult.cloneNode(true);
  pane.classList.add("retranslation-result");
  const field = pane.querySelector("textarea");
  field.id = `retranslation-${++resultNumber}`;
  field.value = result.text || "";
  const label = pane.querySelector("label");
  label.htmlFor = field.id;
  label.textContent = "再翻訳";
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
  await api(`history/${encodeURIComponent(currentHistoryId)}/chain`, "PUT", {
    original: text.value, results,
  });
  loadHistory();
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
    feedback("feedback", "「再翻訳」の右にある言語ボタンから翻訳先を選んでください。", true);
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
  feedback("feedback", "再翻訳中…");
  updateControls();
  try {
    const started = performance.now();
    const result = await translateStream({
      text: original, source: translatedLanguage, target: destination,
    }, (fragment) => updateStreamText(field, field.value + fragment));
    updateStreamText(field, result.text);
    setResultLanguages(next, result);
    elapsed.textContent = `翻訳時間 ${((performance.now() - started) / 1000).toFixed(2)}秒`;
    await saveCurrentChain();
    feedback("feedback", result.truncated ? "再翻訳が出力上限に達しました。" : "");
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
  if (event.target.matches(".result textarea")) updateControls();
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
  target.value = "auto";
  resetResults();
  currentHistoryId = entry.id;
  setResultLanguages(firstResult, entry);
  let previous = firstResult;
  for (const result of entry.retranslations || []) {
    previous = addResultPane(previous, result);
  }
  showPanes(0, "instant");
  feedback("feedback", entry.truncated ? "この訳文は出力上限で途中まで表示されています。" : "");
  updateControls();
}

function updateHistoryEditing() {
  const menu = $("history-edit-menu");
  if (!editingHistory || deletingHistory) menu.hidden = true;
  $("history-list").toggleAttribute("data-editing", editingHistory);
  $("edit-history").setAttribute("aria-pressed", String(editingHistory));
  $("edit-history").setAttribute("aria-expanded", String(!menu.hidden));
  $("edit-history").title = editingHistory ? "履歴の編集メニュー" : "履歴を編集";
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
  if (!ids.length || !(await confirmAction("翻訳履歴を削除しますか？",
    `${ids.length}件の履歴を削除します。`, "削除する"))) return;
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
  feedback("history-feedback", "履歴を読み込み中…");
  try {
    const entries = await api("history");
    if (request !== historyRequest) return;
    const ids = new Set(entries.map((entry) => entry.id));
    for (const id of selectedHistory) {
      if (!ids.has(id)) selectedHistory.delete(id);
    }
    list.replaceChildren();
    feedback("history-feedback", entries.length ? "" : "翻訳履歴はありません。");
    for (const entry of entries) {
      const row = $("history-entry").content.firstElementChild.cloneNode(true);
      const open = row.querySelector(".history-restore");
      const title = entry.original.trim().replace(/\s+/g, " ");
      open.textContent = title;
      open.title = title;
      const checkbox = row.querySelector(".history-select");
      checkbox.value = entry.id;
      checkbox.checked = selectedHistory.has(entry.id);
      checkbox.setAttribute("aria-label", `「${title}」を選択`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedHistory.add(entry.id);
        else selectedHistory.delete(entry.id);
        updateHistoryEditing();
      });
      open.addEventListener("click", () => {
        if (editingHistory) checkbox.click();
        else restoreHistory(entry);
      });
      list.append(row);
    }
    updateHistoryEditing();
  } catch (error) {
    if (request === historyRequest) feedback("history-feedback", error.message, true);
  }
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
  try {
    await navigator.clipboard.writeText(field.value);
    feedback("feedback", "訳文をコピーしました。");
  } catch {
    field.select();
    feedback("feedback", "自動でコピーできませんでした。選択した訳文をコピーしてください。", true);
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
  nativeLanguage.value = savedNativeLanguage || "ja";
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
    feedback("native-language-feedback", "よく使う言語には、自分の言語と異なる言語を選んでください。", true);
    return;
  }
  try {
    localStorage.setItem(nativeLanguageKey, nativeLanguage.value);
    localStorage.setItem(frequentLanguageKey, frequentLanguage.value);
  } catch {
    feedback("native-language-feedback", "翻訳先の設定を保存できませんでした。ブラウザーのサイトデータ設定を確認してください。", true);
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
    source.add(new Option("自動判定", "auto"));
    target.add(new Option("自動切り替え", "auto"));
    for (const [code, name] of Object.entries(languages)) {
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
    feedback("feedback", "言語一覧を取得できませんでした。ページを再読み込みしてください。", true);
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
  if (!(await confirmAction(`翻訳用モデルをダウンロード（${starterModel.size}GB）`,
    "最も小さい翻訳用モデルをブラウザに保存します。\n保存したモデルは「モデル管理」から削除できます。",
    "ダウンロード", false))) return;

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
