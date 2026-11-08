import { offlineCacheName } from "./static/offline-cache.js";

const scope = new URL(self.registration.scope);
const shellPrefix = `plamo-shell:${scope.pathname}:`;
const shellCacheName = shellPrefix + shellVersion;
const shellUrls = new Set(appShell.map((path) => new URL(path, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(shellCacheName).then((cache) => cache.addAll(appShell)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(shellPrefix) && name !== shellCacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("Range")) return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;

  const navigation = request.mode === "navigate" &&
    (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`);
  const asset = url.pathname.startsWith(`${scope.pathname}static/`) &&
    /\.(?:css|js|mjs|wasm|json|png|bin\.gz)$/.test(url.pathname);
  if (navigation || shellUrls.has(url.href)) {
    event.respondWith(loadShell(request, navigation ? scope.href : url.href));
  } else if (asset) {
    event.respondWith(loadAsset(request));
  }
});

async function loadShell(request, key) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(shellCacheName);
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function loadAsset(request) {
  const cache = await caches.open(offlineCacheName);
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
  if (response.ok && response.status !== 206 && !response.redirected) {
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}
