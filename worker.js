/**
 * PAROKH GOLD EA — Cloudflare Worker
 * Serves static assets + proxies /api/* → Supabase (fixes browser ERR_EMPTY_RESPONSE)
 */
const SUPABASE = "https://kklgwyldzpimtzdaleq.supabase.co";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": url.origin,
            "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer",
            "access-control-allow-credentials": "true",
            "access-control-max-age": "86400"
          }
        });
      }
      return proxySupabase(request, url);
    }

    // Static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Assets binding missing", { status: 500 });
  }
};

async function proxySupabase(request, url) {
  // /api/auth/v1/signup → https://xxx.supabase.co/auth/v1/signup
  const targetPath = url.pathname.replace(/^\/api/, "") + url.search;
  const targetUrl = SUPABASE + targetPath;

  const headers = new Headers();
  // Forward critical headers
  for (const h of ["content-type", "authorization", "apikey", "x-client-info", "x-supabase-api-version", "prefer", "accept"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  // Ensure apikey present if client sent it
  if (!headers.has("apikey")) {
    const auth = headers.get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      // ok
    }
  }

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let res;
  try {
    res = await fetch(targetUrl, init);
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_upstream_failed", message: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
    });
  }

  // CORS for safety (same-origin usually enough)
  const out = new Headers(res.headers);
  out.set("access-control-allow-origin", url.origin);
  out.set("access-control-allow-credentials", "true");
  out.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer");
  out.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: out });
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
