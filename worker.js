/**
 * PAROKH GOLD EA — Cloudflare Worker
 * /api/*  → Supabase proxy + bans list
 * other   → static assets
 */
const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";
const BAN_SECRET = "ParokhBan#2026!";

if (!globalThis.__PAROKH_BANS) globalThis.__PAROKH_BANS = new Set();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/bans" || url.pathname === "/api/bans/") {
      return handleBans(request);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, url);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("ASSETS binding missing", { status: 500 });
  },
};

async function handleBans(request) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "GET") {
    const list = Array.from(globalThis.__PAROKH_BANS || []);
    return new Response(JSON.stringify({ bans: list }), { status: 200, headers });
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    if (body.secret !== BAN_SECRET) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: "email_required" }), { status: 400, headers });
    }
    if (body.action === "unban") {
      globalThis.__PAROKH_BANS.delete(email);
    } else {
      globalThis.__PAROKH_BANS.add(email);
    }
    return new Response(JSON.stringify({ ok: true, bans: Array.from(globalThis.__PAROKH_BANS) }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: "method" }), { status: 405, headers });
}

async function handleApi(request, url) {
  let path = url.pathname.slice(4);
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
    out.delete("content-encoding");
    out.delete("transfer-encoding");
    corsHeaders(request).forEach((v, k) => out.set(k, v));
    const body = await upstream.arrayBuffer();
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "proxy_failed", message: String(err && err.message ? err.message : err) }),
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
