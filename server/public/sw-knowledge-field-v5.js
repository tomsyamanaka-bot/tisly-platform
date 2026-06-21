/* Knowledge Field UX V5 — stale-while-revalidate cache for knowledge APIs */
const KNOWLEDGE_CACHE_V5 = "tisly-knowledge-field-v5";
const KNOWLEDGE_CACHE_MAX = 20;
let knowledgeCacheEnabledV5 = true;

const KNOWLEDGE_CACHEABLE_PATHS = new Set([
  "/api/knowledge/files-v1",
  "/api/knowledge/detail-v1",
  "/api/knowledge/search-v1",
  "/api/knowledge/project-access-v1",
]);

function isKnowledgeCacheable(pathname) {
  if (KNOWLEDGE_CACHEABLE_PATHS.has(pathname)) return true;
  return pathname.startsWith("/api/knowledge/project-access-v1/");
}

async function trimKnowledgeCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= KNOWLEDGE_CACHE_MAX) return;
  const excess = keys.slice(0, keys.length - KNOWLEDGE_CACHE_MAX);
  await Promise.all(excess.map((k) => cache.delete(k)));
}

async function handleKnowledgeFetchV5(request) {
  if (!knowledgeCacheEnabledV5) {
    try {
      return await fetch(request);
    } catch {
      return new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const cache = await caches.open(KNOWLEDGE_CACHE_V5);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(request, res.clone());
        await trimKnowledgeCache(cache);
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    fetchAndUpdate.catch(() => {});
    return cached;
  }

  const network = await fetchAndUpdate;
  if (network) return network;

  return new Response(JSON.stringify({ error: "offline", cached: false }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  if (!url.pathname.startsWith("/api/knowledge/")) return;
  if (!isKnowledgeCacheable(url.pathname)) return;
  event.respondWith(handleKnowledgeFetchV5(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "KNOWLEDGE_CACHE_V5") {
    knowledgeCacheEnabledV5 = event.data.enabled !== false;
    event.ports?.[0]?.postMessage?.({ ok: true, enabled: knowledgeCacheEnabledV5 });
  }
  if (event.data?.type === "CLEAR_KNOWLEDGE_CACHE_V5") {
    event.waitUntil?.(
      caches.delete(KNOWLEDGE_CACHE_V5).then(() => {
        event.ports?.[0]?.postMessage?.({ ok: true });
      })
    );
  }
});
