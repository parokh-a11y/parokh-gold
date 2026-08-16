/**
 * PAROKH GOLD EA — Cloudflare Worker v1.11
 */
const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";
const BAN_SECRET = "ParokhBan#2026!";
const DATA_SECRET = "ParokhBan#2026!";

if (!globalThis.__PAROKH_BANS) globalThis.__PAROKH_BANS = new Set();
if (!globalThis.__PAROKH_ORDERS) globalThis.__PAROKH_ORDERS = [];
if (!globalThis.__PAROKH_NOTIFS) globalThis.__PAROKH_NOTIFS = {}; // email -> [{text,at,read}]
if (!globalThis.__PAROKH_LIC_REQ) globalThis.__PAROKH_LIC_REQ = [];

function securityHeaders(headers) {
  const h = new Headers(headers || {});
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("Content-Security-Policy")) {
    h.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'self'; form-action 'self';");
  }
  return h;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,x-supabase-auth,x-parokh-secret",
    "Access-Control-Expose-Headers": "content-range,x-supabase-api-version",
  });
}

function json(data, status, request) {
  const h = corsHeaders(request);
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/bans" || p === "/api/bans/") return handleBans(request);
    if (p === "/api/orders" || p === "/api/orders/") return handleOrders(request);
    if (p === "/api/notifications" || p === "/api/notifications/") return handleNotifs(request);
    if (p === "/api/license-requests" || p === "/api/license-requests/") return handleLicReq(request);

    if (p === "/api" || p.startsWith("/api/")) return handleApi(request, url);

    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      const h = securityHeaders(res.headers);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
    return new Response("ASSETS missing", { status: 500 });
  },
};

async function handleBans(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method === "GET") return json({ bans: Array.from(globalThis.__PAROKH_BANS) }, 200, request);
  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    if (body.secret !== BAN_SECRET) return json({ error: "forbidden" }, 403, request);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "email_required" }, 400, request);
    if (body.action === "unban") globalThis.__PAROKH_BANS.delete(email);
    else globalThis.__PAROKH_BANS.add(email);
    return json({ ok: true, bans: Array.from(globalThis.__PAROKH_BANS) }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleOrders(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method === "GET") {
    return json({ orders: globalThis.__PAROKH_ORDERS.slice().reverse() }, 200, request);
  }
  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const order = {
      id: "PG-" + Date.now().toString(36).toUpperCase(),
      at: new Date().toISOString(),
      name: String(body.name || "").slice(0, 120),
      email: String(body.email || "").trim().toLowerCase().slice(0, 160),
      broker: String(body.broker || "").slice(0, 120),
      account: String(body.account || "").slice(0, 64),
      kind: String(body.kind || "full").slice(0, 32),
      plan: String(body.plan || "").slice(0, 32),
      status: "pending"
    };
    globalThis.__PAROKH_ORDERS.push(order);
    if (globalThis.__PAROKH_ORDERS.length > 500) globalThis.__PAROKH_ORDERS = globalThis.__PAROKH_ORDERS.slice(-500);
    // notify user mailbox
    if (order.email) {
      if (!globalThis.__PAROKH_NOTIFS[order.email]) globalThis.__PAROKH_NOTIFS[order.email] = [];
      globalThis.__PAROKH_NOTIFS[order.email].unshift({
        text: "سفارش شما ثبت شد: " + order.id + " — در صف بررسی پشتیبانی",
        at: order.at,
        read: false
      });
    }
    return json({ ok: true, order }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleNotifs(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === "GET") {
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return json({ notifications: [] }, 200, request);
    const list = globalThis.__PAROKH_NOTIFS[email] || [];
    return json({ notifications: list }, 200, request);
  }
  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    // mark read
    if (body.action === "read") {
      const email = String(body.email || "").trim().toLowerCase();
      const list = globalThis.__PAROKH_NOTIFS[email] || [];
      list.forEach(n => { n.read = true; });
      return json({ ok: true }, 200, request);
    }
    // admin send
    if (body.secret !== DATA_SECRET) return json({ error: "forbidden" }, 403, request);
    const email = String(body.email || "").trim().toLowerCase();
    const text = String(body.text || "").slice(0, 500);
    if (!email || !text) return json({ error: "email_text_required" }, 400, request);
    if (!globalThis.__PAROKH_NOTIFS[email]) globalThis.__PAROKH_NOTIFS[email] = [];
    globalThis.__PAROKH_NOTIFS[email].unshift({ text, at: new Date().toISOString(), read: false });
    if (globalThis.__PAROKH_NOTIFS[email].length > 100) globalThis.__PAROKH_NOTIFS[email] = globalThis.__PAROKH_NOTIFS[email].slice(0, 100);
    return json({ ok: true }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleLicReq(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method === "GET") {
    return json({ requests: globalThis.__PAROKH_LIC_REQ.slice().reverse() }, 200, request);
  }
  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const row = {
      email: String(body.email || "").trim().toLowerCase(),
      name: String(body.name || "").slice(0, 120),
      at: new Date().toISOString(),
      status: "pending"
    };
    if (!row.email) return json({ error: "email" }, 400, request);
    globalThis.__PAROKH_LIC_REQ.push(row);
    if (globalThis.__PAROKH_LIC_REQ.length > 300) globalThis.__PAROKH_LIC_REQ = globalThis.__PAROKH_LIC_REQ.slice(-300);
    return json({ ok: true, request: row }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleApi(request, url) {
  let path = url.pathname.slice(4);
  if (!path.startsWith("/")) path = "/" + path;
  const target = SUPABASE_URL + path + url.search;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const low = k.toLowerCase();
    if (low === "host" || low.startsWith("cf-")) continue;
    headers.set(k, v);
  }
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  try {
    const upstream = await fetch(target, init);
    const out = new Headers(upstream.headers);
    out.delete("content-encoding");
    out.delete("transfer-encoding");
    corsHeaders(request).forEach((v, k) => out.set(k, v));
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, statusText: upstream.statusText, headers: out });
  } catch (err) {
    return json({ error: "proxy_failed", message: String(err && err.message ? err.message : err) }, 502, request);
  }
}
