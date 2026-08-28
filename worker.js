/**
 * PAROKH GOLD EA — Worker v1.21
 * JWT verify via Supabase Auth, KV durable store, admin rate-limit, TXID API
 */
const ALLOWED_ORIGINS = new Set([
  "https://parokh.ir",
  "https://www.parokh.ir",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:8787",
  "http://localhost:8787"
]);

const PLAN_PRICES = { "1m": 39, "6m": 119, "12m": 199, demo: 0 };

function securityHeaders(headers) {
  const h = new Headers(headers || {});
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("Content-Security-Policy")) {
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
    );
  }
  return h;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://parokh.ir";
  return new Headers({
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,x-supabase-auth,x-parokh-secret,x-parokh-admin",
    "Access-Control-Expose-Headers": "content-range,x-supabase-api-version",
    Vary: "Origin"
  });
}

function json(data, status, request) {
  const h = corsHeaders(request);
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: securityHeaders(h) });
}

function b64url(buf) {
  let s;
  if (typeof buf === "string") s = btoa(unescape(encodeURIComponent(buf)));
  else s = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return decodeURIComponent(escape(atob(str)));
}

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return b64url(sig);
}

async function issueAdminToken(env, user) {
  const secret = env.ADMIN_SECRET || env.DATA_SECRET || "";
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + 8 * 3600;
  const payload = b64url(JSON.stringify({ u: user, exp, r: "admin" }));
  const sig = await hmacSign(secret, payload);
  return payload + "." + sig;
}

async function verifyAdminToken(request, env) {
  const secret = env.ADMIN_SECRET || env.DATA_SECRET || "";
  if (!secret) return null;
  let token =
    request.headers.get("x-parokh-admin") ||
    request.headers.get("x-parokh-secret") ||
    "";
  const auth = request.headers.get("authorization") || "";
  if (!token && auth.toLowerCase().startsWith("bearer ")) {
    const maybe = auth.slice(7).trim();
    // admin tokens are payload.sig (one dot, not JWT three parts)
    if (maybe.split(".").length === 2) token = maybe;
  }
  if (!token || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expect = await hmacSign(secret, payload);
  if (expect !== sig) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (!data || data.r !== "admin") return null;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/** Verify Supabase user JWT by calling Auth API */
async function verifySupabaseUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const jwt = auth.slice(7).trim();
  // skip admin-style tokens
  if (jwt.split(".").length === 2) return null;
  const base = env.SUPABASE_URL || "https://kklgwyldzpimztzdaleq.supabase.co";
  const anon = env.SUPABASE_ANON_KEY || "";
  try {
    const headers = {
      Authorization: "Bearer " + jwt,
      apikey: anon || jwt
    };
    const res = await fetch(base + "/auth/v1/user", { headers });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.email) return null;
    return {
      id: user.id,
      email: String(user.email).toLowerCase(),
      user
    };
  } catch (_) {
    return null;
  }
}

async function kvGetJson(env, key, fallback) {
  if (!env.PAROKH_KV) return fallback;
  try {
    const v = await env.PAROKH_KV.get(key, "json");
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

async function kvPutJson(env, key, value) {
  if (!env.PAROKH_KV) return false;
  try {
    await env.PAROKH_KV.put(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

async function isBanned(env, email) {
  if (!email) return false;
  const bans = (await kvGetJson(env, "bans", [])) || [];
  return bans.includes(String(email).toLowerCase());
}

async function checkAdminRateLimit(env, ip) {
  if (!env.PAROKH_KV) return { ok: true };
  const key = "rl:admin:" + (ip || "unknown");
  let row = { n: 0, t: Date.now() };
  try {
    const v = await env.PAROKH_KV.get(key, "json");
    if (v) row = v;
  } catch (_) {}
  const windowMs = 15 * 60 * 1000;
  if (Date.now() - (row.t || 0) > windowMs) row = { n: 0, t: Date.now() };
  if (row.n >= 8) return { ok: false, retryAfter: Math.ceil((windowMs - (Date.now() - row.t)) / 1000) };
  return { ok: true, row, key };
}

async function bumpAdminRateLimit(env, ip, row, key) {
  if (!env.PAROKH_KV) return;
  row.n = (row.n || 0) + 1;
  row.t = row.t || Date.now();
  try {
    await env.PAROKH_KV.put(key, JSON.stringify(row), { expirationTtl: 900 });
  } catch (_) {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/admin/login" || p === "/api/admin/login/") return handleAdminLogin(request, env);
    if (p === "/api/admin/ping" || p === "/api/admin/ping/") return handleAdminPing(request, env);
    if (p === "/api/bans" || p === "/api/bans/") return handleBans(request, env);
    if (p === "/api/orders" || p === "/api/orders/") return handleOrders(request, env);
    if (p.match(/^\/api\/orders\/[^/]+\/payment\/?$/)) return handleOrderPayment(request, env, p);
    if (p === "/api/notifications" || p === "/api/notifications/") return handleNotifs(request, env);
    if (p === "/api/license-requests" || p === "/api/license-requests/") return handleLicReq(request, env);

    // Limited Supabase proxy allowlist
    if (p.startsWith("/api/auth/") || p.startsWith("/api/rest/")) {
      return handleApiProxy(request, url, env);
    }
    if (p === "/api" || p.startsWith("/api/")) {
      return json({ error: "not_found" }, 404, request);
    }

    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(request);
      const h = securityHeaders(res.headers);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
    return new Response("Not found", { status: 404 });
  }
};

async function handleAdminLogin(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json({ error: "method" }, 405, request);

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const rl = await checkAdminRateLimit(env, ip);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429, request);

  const adminUser = (env.ADMIN_USER || "parokh").trim();
  const adminPass = env.ADMIN_PASS || "";
  if (!adminPass) {
    return json({ error: "admin_not_configured" }, 503, request);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const user = String(body.user || body.username || "").trim();
  const pass = String(body.pass || body.password || "");

  if (user !== adminUser || pass !== adminPass) {
    await bumpAdminRateLimit(env, ip, rl.row || { n: 0, t: Date.now() }, rl.key || ("rl:admin:" + ip));
    return json({ error: "invalid_credentials" }, 401, request);
  }

  const token = await issueAdminToken(env, user);
  if (!token) return json({ error: "token_failed" }, 503, request);
  return json({ ok: true, token, user, expiresIn: 8 * 3600 }, 200, request);
}

async function handleAdminPing(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ ok: false, error: "forbidden" }, 403, request);
  return json({ ok: true, user: adm.u, storage: env.PAROKH_KV ? "kv" : "none" }, 200, request);
}

async function handleBans(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ error: "forbidden" }, 403, request);

  const bans = (await kvGetJson(env, "bans", [])) || [];
  if (request.method === "GET") {
    return json({ bans, durable: !!env.PAROKH_KV }, 200, request);
  }
  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!email) return json({ error: "email_required" }, 400, request);
    let next = bans.slice();
    if (body.action === "unban") next = next.filter((e) => e !== email);
    else if (!next.includes(email)) next.push(email);
    await kvPutJson(env, "bans", next);
    return json({ ok: true, bans: next, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleOrders(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const orders = (await kvGetJson(env, "orders", [])) || [];
  const adm = await verifyAdminToken(request, env);
  const user = await verifySupabaseUser(request, env);

  if (request.method === "GET") {
    if (adm) {
      return json({ orders: orders.slice().reverse(), durable: !!env.PAROKH_KV }, 200, request);
    }
    if (user) {
      const mine = orders.filter((o) => o.email === user.email).reverse();
      return json({ orders: mine, durable: !!env.PAROKH_KV }, 200, request);
    }
    return json({ error: "forbidden" }, 403, request);
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const kind = body.kind === "demo" ? "demo" : "full";
    const plan = String(body.plan || (kind === "demo" ? "demo" : "12m"));
    if (!(plan in PLAN_PRICES)) return json({ error: "invalid_plan" }, 400, request);

    // full orders require authenticated user
    if (kind === "full") {
      if (!user) return json({ error: "auth_required" }, 401, request);
      if (await isBanned(env, user.email)) return json({ error: "banned" }, 403, request);
    }

    let email =
      kind === "full"
        ? user.email
        : String(body.email || "")
            .trim()
            .toLowerCase();
    if (user && kind === "demo") email = user.email || email;

    if (email && (await isBanned(env, email))) return json({ error: "banned" }, 403, request);

    const price = PLAN_PRICES[plan];
    const id =
      "PG-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    const order = {
      id,
      name: String(body.name || "").slice(0, 120),
      email,
      broker: String(body.broker || "").slice(0, 120),
      account: String(body.account || "").slice(0, 64),
      kind,
      plan,
      price,
      currency: "USDT",
      network: "TRC20",
      paymentAddress: env.PAYMENT_ADDRESS_TRC20 || null,
      paymentMode: env.PAYMENT_ADDRESS_TRC20 ? "fixed_env" : "pending_config",
      paymentStatus: kind === "demo" ? "N_A" : "WAITING_FOR_PAYMENT",
      txid: null,
      txidAt: null,
      ex5Status: "PENDING",
      licenseStatus: "PENDING",
      deliveryStatus: "PENDING",
      createdAt: new Date().toISOString(),
      userId: user ? user.id : null
    };

    if (!order.email || !order.name) return json({ error: "fields_required" }, 400, request);
    if (order.kind === "full" && (!order.broker || !order.account)) {
      return json({ error: "broker_account_required" }, 400, request);
    }

    const next = orders.concat([order]).slice(-2000);
    await kvPutJson(env, "orders", next);

    const notifs = (await kvGetJson(env, "notifs", {})) || {};
    if (!notifs[order.email]) notifs[order.email] = [];
    notifs[order.email].unshift({
      text: "Order " + order.id + " · $" + order.price + " · " + order.paymentStatus,
      at: new Date().toISOString(),
      read: false
    });
    notifs[order.email] = notifs[order.email].slice(0, 100);
    await kvPutJson(env, "notifs", notifs);

    return json({ ok: true, order, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleOrderPayment(request, env, path) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST" && request.method !== "PATCH") {
    return json({ error: "method" }, 405, request);
  }

  const m = path.match(/^\/api\/orders\/([^/]+)\/payment\/?$/);
  const orderId = m ? decodeURIComponent(m[1]) : "";
  if (!orderId) return json({ error: "id" }, 400, request);

  const user = await verifySupabaseUser(request, env);
  const adm = await verifyAdminToken(request, env);
  if (!user && !adm) return json({ error: "auth_required" }, 401, request);

  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const txid = String(body.txid || body.tx || "")
    .trim()
    .slice(0, 128);
  if (!txid || txid.length < 8) return json({ error: "txid_required" }, 400, request);

  const orders = (await kvGetJson(env, "orders", [])) || [];
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return json({ error: "not_found" }, 404, request);
  const order = orders[idx];

  if (!adm && order.email !== user.email) return json({ error: "forbidden" }, 403, request);
  if (await isBanned(env, order.email)) return json({ error: "banned" }, 403, request);

  order.txid = txid;
  order.txidAt = new Date().toISOString();
  order.paymentStatus = "PAYMENT_REVIEW"; // manual review
  orders[idx] = order;
  await kvPutJson(env, "orders", orders);

  const notifs = (await kvGetJson(env, "notifs", {})) || {};
  if (!notifs[order.email]) notifs[order.email] = [];
  notifs[order.email].unshift({
    text: "TXID received for " + order.id + " — under manual review",
    at: new Date().toISOString(),
    read: false
  });
  await kvPutJson(env, "notifs", notifs);

  return json({ ok: true, order, durable: !!env.PAROKH_KV }, 200, request);
}

async function handleNotifs(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const notifs = (await kvGetJson(env, "notifs", {})) || {};
  const url = new URL(request.url);
  const adm = await verifyAdminToken(request, env);
  const user = await verifySupabaseUser(request, env);

  if (request.method === "GET") {
    if (adm) {
      const email = String(url.searchParams.get("email") || "")
        .trim()
        .toLowerCase();
      if (!email) return json({ items: [], all: notifs }, 200, request);
      return json({ items: notifs[email] || [] }, 200, request);
    }
    if (!user) return json({ error: "auth_required" }, 401, request);
    if (await isBanned(env, user.email)) return json({ error: "banned" }, 403, request);
    return json({ items: notifs[user.email] || [] }, 200, request);
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    if (body.action === "mark_read") {
      if (!user && !adm) return json({ error: "auth_required" }, 401, request);
      const email = adm
        ? String(body.email || "")
            .trim()
            .toLowerCase()
        : user.email;
      if (!email) return json({ error: "email" }, 400, request);
      if (!adm && email !== user.email) return json({ error: "forbidden" }, 403, request);
      const list = notifs[email] || [];
      list.forEach((n) => {
        n.read = true;
      });
      notifs[email] = list;
      await kvPutJson(env, "notifs", notifs);
      return json({ ok: true }, 200, request);
    }

    if (!adm) return json({ error: "forbidden" }, 403, request);
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const text = String(body.text || "").slice(0, 500);
    if (!email || !text) return json({ error: "fields" }, 400, request);
    if (!notifs[email]) notifs[email] = [];
    notifs[email].unshift({ text, at: new Date().toISOString(), read: false });
    notifs[email] = notifs[email].slice(0, 100);
    await kvPutJson(env, "notifs", notifs);
    return json({ ok: true, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleLicReq(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const list = (await kvGetJson(env, "lic_req", [])) || [];
  const adm = await verifyAdminToken(request, env);
  const user = await verifySupabaseUser(request, env);

  if (request.method === "GET") {
    if (!adm) return json({ error: "forbidden" }, 403, request);
    return json({ requests: list.slice().reverse(), durable: !!env.PAROKH_KV }, 200, request);
  }

  if (request.method === "POST") {
    if (!user) return json({ error: "auth_required" }, 401, request);
    if (await isBanned(env, user.email)) return json({ error: "banned" }, 403, request);

    let body = {};
    try {
      body = await request.json();
    } catch (_) {}
    const row = {
      email: user.email,
      name: String(body.name || "").slice(0, 120),
      at: new Date().toISOString(),
      status: "pending",
      userId: user.id
    };
    const next = list.concat([row]).slice(-1000);
    await kvPutJson(env, "lic_req", next);
    return json({ ok: true, request: row, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleApiProxy(request, url, env) {
  const SUPABASE_URL = env.SUPABASE_URL || "https://kklgwyldzpimztzdaleq.supabase.co";
  // only auth paths
  let path = url.pathname.replace(/^\/api/, "");
  if (!path.startsWith("/auth/") && !path.startsWith("/rest/")) {
    return json({ error: "proxy_denied" }, 403, request);
  }
  const target = SUPABASE_URL + path + url.search;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
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
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: securityHeaders(out)
    });
  } catch (err) {
    return json({ error: "proxy_failed", message: String(err && err.message ? err.message : err) }, 502, request);
  }
}
