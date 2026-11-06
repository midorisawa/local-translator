import { t } from "./i18n.js";

let database;

function openRecords() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("plamo-records", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

export async function records(key, update) {
  const db = await openRecords();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", update ? "readwrite" : "readonly");
    const store = transaction.objectStore("records");
    let result;
    let error;
    store.get(key).onsuccess = ({ target }) => {
      const entries = target.result || [];
      try {
        result = update ? update(entries) : entries;
        if (update) store.put(entries, key);
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(error || transaction.error);
  });
}

function glossary(preset) {
  if (!preset || typeof preset.name !== "string" || !preset.name.trim() || preset.name.length > 80 ||
      !Array.isArray(preset.terms) || !preset.terms.length || preset.terms.length > 20) {
    throw new Error(t("用語集の名前と用語を確認してください。"));
  }
  const terms = preset.terms.map(({ source, target, enabled = true }) => {
    if ([source, target].some((term) => typeof term !== "string" || !term.trim() || term.length > 200) ||
        typeof enabled !== "boolean") throw new Error(t("用語集の用語を確認してください。"));
    return { source, target, enabled };
  });
  return { name: preset.name, terms };
}

export function recordApi(path, method, body) {
  const [key, id] = path.split("/");
  if (method === "GET") return records(key);
  if (key === "glossaries" && method === "POST") {
    if (!Array.isArray(body) || !body.length) throw new Error(t("用語集を1件以上含むJSONファイルを選んでください。"));
    const presets = body.map((preset) => ({ ...glossary(preset), id: crypto.randomUUID() }));
    return records(key, (entries) => { entries.push(...presets); return presets; });
  }
  if (key === "glossaries" && method === "PUT") {
    const preset = { ...glossary(body), id };
    return records(key, (entries) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index !== -1) entries.splice(index, 1);
      entries.push(preset);
      return preset;
    });
  }
  if (key === "history" && method === "PUT") {
    return records(key, (entries) => {
      const entry = entries.find((entry) => entry.id === id);
      if (!entry) throw new Error(t("元の翻訳履歴が見つかりません。"));
      const [first, ...retranslations] = body.results;
      Object.assign(entry, first, { retranslations });
      return { saved: true };
    });
  }
  const ids = new Set(id ? [id] : body.ids);
  return records(key, (entries) => {
    let deleted = 0;
    for (let index = entries.length - 1; index >= 0; index--) {
      if (ids.has(entries[index].id)) {
        entries.splice(index, 1);
        deleted++;
      }
    }
    return { deleted };
  });
}
