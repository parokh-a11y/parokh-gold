/**
 * PAROKH GOLD EA — Cloudflare Worker
 * /api/*  → Supabase proxy (must never fall through to HTML)
 * other   → static assets
 */
const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- API PROXY (highest priority) ----
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, url);
    }

    // ---- STATIC ----
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      // If asset missing, do NOT return index for /api (already handled)
      return res;
    }
    return new Response("ASSETS binding missing — redeploy with wrangler.toml assets", { status: 500 });
  },
};

async function handleApi(request, url) {
  // /api/auth/v1/health  →  /auth/v1/health
  let path = url.pathname.slice(4); // remove "/api"
  if (!path.startsWith("/")) path = "/" + path;
  const target = SUPABASE_URL + path + url.search;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const low = k.toLowerCase();
    if (low === "host" || low === "cf-connecting-ip" || low === "cf-ray" || low === "cf-visitor") continue;
    headers.set(k, v);
  }

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    const out = new Headers(upstream.headers);
    // strip hop-by-hop
    out.delete("content-encoding");
    out.delete("transfer-encoding");
    corsHeaders(request).forEach((v, k) => out.set(k, v));
    const body = await upstream.arrayBuffer();
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "proxy_failed", message: String(err && err.message ? err.message : err), target }),
      { status: 502, headers: Object.assign({ "Content-Type": "application/json" }, Object.fromEntries(corsHeaders(request))) }
    );
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,x-supabase-auth",
    "Access-Control-Expose-Headers": "content-range,x-supabase-api-version",
  });
}
