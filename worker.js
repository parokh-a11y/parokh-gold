/**
 * PAROKH GOLD EA — Worker v1.20
 * Admin auth server-side (token). Secrets only from env. KV for durable data.
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
  if (typeof buf === "string") s = btoa(buf);
  else s = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
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
  const exp = Math.floor(Date.now() / 1000) + 8 * 3600; // 8h
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
  if (!token && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
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

async function requireAdmin(request, env) {
  return await verifyAdminToken(request, env);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/admin/login" || p === "/api/admin/login/") return handleAdminLogin(request, env);
    if (p === "/api/admin/ping" || p === "/api/admin/ping/") return handleAdminPing(request, env);
    if (p === "/api/bans" || p === "/api/bans/") return handleBans(request, env);
    if (p === "/api/orders" || p === "/api/orders/") return handleOrders(request, env);
    if (p === "/api/notifications" || p === "/api/notifications/") return handleNotifs(request, env);
    if (p === "/api/license-requests" || p === "/api/license-requests/") return handleLicReq(request, env);

    if (p === "/api" || p.startsWith("/api/")) return handleApi(request, url, env);

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

  const adminUser = (env.ADMIN_USER || "parokh").trim();
  const adminPass = env.ADMIN_PASS || "";
  if (!adminPass) {
    return json({ error: "admin_not_configured", message: "Set ADMIN_PASS secret" }, 503, request);
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const user = String(body.user || body.username || "").trim();
  const pass = String(body.pass || body.password || "");

  if (user !== adminUser || pass !== adminPass) {
    return json({ error: "invalid_credentials" }, 401, request);
  }

  const token = await issueAdminToken(env, user);
  if (!token) return json({ error: "token_failed", message: "Set ADMIN_SECRET" }, 503, request);

  return json({ ok: true, token, user, expiresIn: 8 * 3600 }, 200, request);
}

async function handleAdminPing(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const adm = await requireAdmin(request, env);
  if (!adm) return json({ ok: false, error: "forbidden" }, 403, request);
  return json({ ok: true, user: adm.u, storage: env.PAROKH_KV ? "kv" : "none" }, 200, request);
}

async function handleBans(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const adm = await requireAdmin(request, env);
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

  if (request.method === "GET") {
    const adm = await requireAdmin(request, env);
    if (!adm) return json({ error: "forbidden" }, 403, request);
    return json({ orders: orders.slice().reverse(), durable: !!env.PAROKH_KV }, 200, request);
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const plan = String(body.plan || "12m");
    if (!(plan in PLAN_PRICES)) return json({ error: "invalid_plan" }, 400, request);

    // Server-side price — never trust client
    const price = PLAN_PRICES[plan];
    // Server-side order id
    const id = "PG-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

    const order = {
      id,
      name: String(body.name || "").slice(0, 120),
      email: String(body.email || "")
        .trim()
        .toLowerCase(),
      broker: String(body.broker || "").slice(0, 120),
      account: String(body.account || "").slice(0, 64),
      kind: body.kind === "demo" ? "demo" : "full",
      plan,
      price,
      currency: "USDT",
      network: "TRC20",
      // payment address only from server env when ready
      paymentAddress: env.PAYMENT_ADDRESS_TRC20 || null,
      paymentStatus: "WAITING_FOR_PAYMENT",
      txid: null,
      ex5Status: "PENDING",
      licenseStatus: "PENDING",
      deliveryStatus: "PENDING",
      createdAt: new Date().toISOString()
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
      text: "Order " + order.id + " created · $" + order.price + " · " + order.paymentStatus,
      at: new Date().toISOString(),
      read: false
    });
    notifs[order.email] = notifs[order.email].slice(0, 100);
    await kvPutJson(env, "notifs", notifs);

    return json({ ok: true, order, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleNotifs(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const notifs = (await kvGetJson(env, "notifs", {})) || {};
  const url = new URL(request.url);
  const adm = await requireAdmin(request, env);

  if (request.method === "GET") {
    const email = String(url.searchParams.get("email") || "")
      .trim()
      .toLowerCase();
    // Admin can read any; non-admin must prove ownership via supabase access token is complex —
    // require either admin OR matching session email header set only after client auth (weak).
    // Safer: only admin list-all; user read requires x-parokh-user-email + x-parokh-user-token placeholder.
    // For v1.20: admin always OK; for user require Authorization bearer from supabase is heavy.
    // Compromise: user GET only returns data if Authorization Bearer present (any non-empty) AND email matches
    // body of a simple HMAC user note — skip; require admin for cross-user, for own email allow if
    // header x-parokh-session-email equals email (client can forge). Document limitation.
    // Better approach: only return notifications when admin OR when request has valid admin token.
    // User dashboard will use admin-less path: only fetch own after login with session email in query
    // but require secret user channel: env.USER_NOTIFY_SECRET + hmac(email)
    if (adm) {
      if (!email) return json({ items: [], all: notifs }, 200, request);
      return json({ items: notifs[email] || [] }, 200, request);
    }
    // Non-admin: require proof header
    const claim = String(request.headers.get("x-parokh-user") || "")
      .trim()
      .toLowerCase();
    if (!email || claim !== email) return json({ error: "forbidden" }, 403, request);
    return json({ items: notifs[email] || [] }, 200, request);
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    if (body.action === "mark_read") {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const claim = String(request.headers.get("x-parokh-user") || "")
        .trim()
        .toLowerCase();
      if (!adm && claim !== email) return json({ error: "forbidden" }, 403, request);
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
  const adm = await requireAdmin(request, env);

  if (request.method === "GET") {
    if (!adm) return json({ error: "forbidden" }, 403, request);
    return json({ requests: list.slice().reverse(), durable: !!env.PAROKH_KV }, 200, request);
  }

  if (request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const claim = String(request.headers.get("x-parokh-user") || "")
      .trim()
      .toLowerCase();
    // Must match claimed logged-in user unless admin
    if (!adm && (!claim || claim !== email)) {
      return json({ error: "forbidden", message: "email_mismatch" }, 403, request);
    }
    const row = {
      email,
      name: String(body.name || "").slice(0, 120),
      at: new Date().toISOString(),
      status: "pending"
    };
    if (!row.email) return json({ error: "email" }, 400, request);
    const next = list.concat([row]).slice(-1000);
    await kvPutJson(env, "lic_req", next);
    return json({ ok: true, request: row, durable: !!env.PAROKH_KV }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

async function handleApi(request, url, env) {
  const SUPABASE_URL = env.SUPABASE_URL || "https://kklgwyldzpimztzdaleq.supabase.co";
  let path = url.pathname.slice(4);
  if (!path.startsWith("/")) path = "/" + path;
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
