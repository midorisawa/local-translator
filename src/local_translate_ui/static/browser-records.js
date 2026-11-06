import { t } from "./i18n.js";

let database;

function putHistory(history, summaries, entry) {
  const title = entry.original.trim().replace(/\s+/g, " ").slice(0, 160);
  history.put(entry);
  summaries.put({ id: entry.id, created_at: entry.created_at, title });
}

function openRecords() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("plamo-records", 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      const db = request.result;
      const history = db.createObjectStore("history", { keyPath: "id" });
      const summaries = db.createObjectStore("history-summaries", { keyPath: "id" });
      if (oldVersion === 0) {
        db.createObjectStore("records");
      } else {
        const legacy = request.transaction.objectStore("records");
        legacy.get("history").onsuccess = ({ target }) => {
          for (const entry of target.result || []) putHistory(history, summaries, entry);
          legacy.delete("history");
        };
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function records(key, update) {
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

async function historyApi(id, method, body) {
  const db = await openRecords();
  const stores = method === "POST" || method === "DELETE"
    ? ["history", "history-summaries"]
    : [method === "GET" && !id ? "history-summaries" : "history"];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, method === "GET" ? "readonly" : "readwrite");
    let result;
    let error;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(error || transaction.error);

    if (method === "GET" && !id) {
      transaction.objectStore("history-summaries").getAll().onsuccess = ({ target }) => {
        result = target.result.sort((a, b) => b.created_at.localeCompare(a.created_at));
      };
      return;
    }

    const history = transaction.objectStore("history");
    if (method === "POST") {
      putHistory(history, transaction.objectStore("history-summaries"), body);
    } else if (method === "DELETE") {
      const summaries = transaction.objectStore("history-summaries");
      for (const key of new Set(id ? [id] : body.ids)) {
        history.delete(key);
        summaries.delete(key);
      }
    } else {
      history.get(id).onsuccess = ({ target }) => {
        const entry = target.result;
        if (!entry) {
          error = new Error(t("元の翻訳履歴が見つかりません。"));
          transaction.abort();
        } else if (method === "PUT") {
          const [first, ...retranslations] = body.results;
          history.put({ ...entry, ...first, retranslations });
          result = { saved: true };
        } else {
          result = entry;
        }
      };
    }
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
  const [key, encodedId] = path.split("/");
  const id = encodedId && decodeURIComponent(encodedId);
  if (key === "history") return historyApi(id, method, body);
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
