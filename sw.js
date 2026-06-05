const CACHE = "batisense-pro-v2";
const ASSETS = [
  "/index.html",
  "/auth.html",
  "/admin_login.html",
  "/Admin_panel.html",
  "/app.py",
  "/batisense-icon.svg",
  "/batisense-logo.svg",
  "/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const { request } = e;
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) {
    e.respondWith(networkFirst(request));
  } else {
    e.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request).then(res => {
    const clone = res.clone();
    caches.open(CACHE).then(cache => cache.put(request, clone));
    return res;
  });
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const clone = res.clone();
    caches.open(CACHE).then(cache => cache.put(request, clone));
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}
