/**
 * PAROKH GOLD EA — Worker v2.0.6 — website → license_requests
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

    if (p === "/api/me/status" || p === "/api/me/status/") return handleMeStatus(request, env);
    if (p === "/api/admin/login" || p === "/api/admin/login/") return handleAdminLogin(request, env);
    if (p === "/api/admin/ping" || p === "/api/admin/ping/") return handleAdminPing(request, env);
    if (p === "/api/bans" || p === "/api/bans/") return handleBans(request, env);
    if (p === "/api/orders" || p === "/api/orders/") return handleOrders(request, env);
    if (p === "/api/payment/wallet" || p === "/api/payment/wallet/") return handlePaymentWallet(request, env);
    if (p === "/api/payment/txid" || p === "/api/payment/txid/") return handlePaymentTxid(request, env);
    if (p === "/api/chat" || p === "/api/chat/") return handleChat(request, env);
    if (p.match(/^\/api\/orders\/[^/]+\/payment\/?$/)) return handleOrderPayment(request, env, p);
    if (p === "/api/notifications" || p === "/api/notifications/") return handleNotifs(request, env);
    if (p === "/api/license-requests" || p === "/api/license-requests/") return handleLicReq(request, env);

    if (p === "/api/support" || p === "/api/support/") return handleSupport(request, env);


    if (p === "/api/admin/audit" || p === "/api/admin/audit/") return handleAudit(request, env);
    if (p === "/api/admin/notify" || p === "/api/admin/notify/") return handleAdminNotify(request, env);
    if (p === "/api/admin/stats" || p === "/api/admin/stats/") return handleAdminStats(request, env);


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

async function handleMeStatus(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "method" }, 405, request);
  }
  const user = await verifySupabaseUser(request, env);
  if (!user) return json({ error: "auth_required" }, 401, request);
  const banned = await isBanned(env, user.email);
  return json({ ok: true, email: user.email, banned: !!banned }, 200, request);
}

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

    if (kind === "full") {
      const ack = !!(body.refundAcknowledged || body.refund_acknowledged);
      if (!ack) return json({ error: "refund_ack_required" }, 400, request);
    }


    // v2.0 guest checkout — no login
    let email = String(body.email || (user && user.email) || "").trim().toLowerCase();
    if (user && user.email) email = String(user.email).toLowerCase();
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
      paymentMode: "usdt_trc20",
      paymentStatus: kind === "demo" ? "N_A" : "PAYMENT_PENDING",
      status: kind === "demo" ? "demo_requested" : "PAYMENT_PENDING",
      refundAcknowledged: !!(body.refundAcknowledged || body.refund_acknowledged),
      refundAcknowledgedAt: (body.refundAcknowledged || body.refund_acknowledged) ? new Date().toISOString() : null,
      txid: null,
      txidAt: null,
      paymentAddress: null,
      ex5Status: "PENDING",
      licenseStatus: "PENDING",
      deliveryStatus: "PENDING",
      createdAt: new Date().toISOString(),
      userId: user ? user.id : null
    };

    if (!order.email || !order.name) return json({ error: "fields_required" }, 400, request);
    // MT5 details collected after payment (offline)
    order.source = String(body.source || "site").slice(0, 40);
    order.replyChannel = String(body.replyChannel || "email").slice(0, 40);
    const wallet = paymentWalletAddress(env);
    if (order.kind === "full") {
      order.paymentAddress = wallet;
      order.paymentStatus = wallet ? "WAITING_PAYMENT" : "PAYMENT_PENDING";
      order.status = order.paymentStatus;
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

    let tg = { ok: false, reason: "skip" };
    try {
      const lines = [
        "PAROKH GOLD · " + (order.kind === "demo" ? "DEMO REQUEST" : "NEW ORDER"),
        "ID: " + order.id,
        "Kind: " + order.kind,
        "Plan: " + order.plan + (order.kind === "full" ? (" · $" + order.price + " USDT") : ""),
        "Name: " + order.name,
        "Email: " + order.email,
        "Source: " + (order.source || "site"),
        "Reply via: " + (order.replyChannel || "email"),
        "Status: " + order.status,
        order.kind === "demo"
          ? "Action: prepare demo and reply by customer email"
          : "Action: customer will pay USDT TRC-20 then send TXID + MT5 account"
      ];
      tg = await notifyTelegram(env, lines.join("\n"), order.id + ":create");
    } catch (e) {
      tg = { ok: false, reason: String(e && e.message ? e.message : e) };
    }

    return json({
      ok: true,
      order,
      telegram: tg,
      payment: order.kind === "full" ? {
        amount: order.price,
        currency: "USDT",
        network: "TRC20",
        wallet: order.paymentAddress || paymentWalletAddress(env),
        status: order.paymentStatus
      } : null,
      durable: !!env.PAROKH_KV
    }, 200, request);
  }
  return json({ error: "method" }, 405, request);
}

function paymentWalletAddress(env) {
  return String(env.PAYMENT_WALLET_ADDRESS || env.PAYMENT_ADDRESS_TRC20 || "").trim();
}

async function handlePaymentWallet(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") return json({ error: "method" }, 405, request);
  const wallet = paymentWalletAddress(env);
  if (!wallet) return json({ error: "wallet_not_configured" }, 503, request);
  return json({ ok: true, wallet, network: "TRC20", currency: "USDT" }, 200, request);
}

async function handlePaymentTxid(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const orderId = String(body.orderId || body.order_id || "").trim();
  const txid = String(body.txid || body.txId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!orderId || !txid) return json({ error: "order_txid_required" }, 400, request);
  if (txid.length < 20 || txid.length > 128) return json({ error: "invalid_txid" }, 400, request);

  const orders = (await kvGetJson(env, "orders", [])) || [];
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return json({ error: "order_not_found" }, 404, request);
  const order = orders[idx];
  if (email && order.email && email !== order.email) return json({ error: "email_mismatch" }, 403, request);

  // prevent same txid on another order
  for (const o of orders) {
    if (o.txid && o.txid === txid && o.id !== orderId) {
      return json({ error: "txid_already_used" }, 409, request);
    }
  }

  const broker = String(body.broker || "").trim().slice(0, 120);
  const account = String(body.account || "").trim().slice(0, 64);
  order.txid = txid;
  order.txidAt = new Date().toISOString();
  if (broker) order.broker = broker;
  if (account) order.account = account;
  order.paymentStatus = "TXID_SUBMITTED";
  order.status = "TXID_SUBMITTED";
  orders[idx] = order;
  await kvPutJson(env, "orders", orders);

  const server = String(body.server || "").trim().slice(0, 120);
  if (!broker || !account) return json({ error: "broker_account_required" }, 400, request);
  if (!server || server.length < 2) return json({ error: "server_required" }, 400, request);
  order.server = server;
  order.broker = broker;
  order.account = account;

  // On-chain verify (same idea as sales bot)
  let paymentVerify = { ok: false, code: "skipped" };
  try {
    paymentVerify = await verifyUsdtTrc20Tx(env, txid, order.price);
  } catch (e) {
    paymentVerify = { ok: false, code: "verify_error", detail: String(e && e.message ? e.message : e) };
  }
  if (paymentVerify.ok) {
    order.paymentStatus = "PAID_VERIFIED";
    order.status = "PAID_VERIFIED";
  } else if (paymentVerify.code === "pending") {
    order.paymentStatus = "TXID_PENDING";
    order.status = "TXID_PENDING";
  } else {
    order.paymentStatus = "TXID_SUBMITTED";
    order.status = "TXID_SUBMITTED";
  }
  order.paymentVerify = paymentVerify;
  orders[idx] = order;
  await kvPutJson(env, "orders", orders);

  let license = { ok: false };
  try {
    license = await createLicenseRequestFromSite(env, order);
    if (license.ok && license.row) {
      await notifyLicenseAdmins(env, license.row, {
        account: order.account,
        broker: order.broker,
        server: order.server,
        plan: planToLicense(order.plan),
        email: order.email,
        orderId: order.id,
      });
    }
  } catch (e) {
    license = { ok: false, reason: String(e && e.message ? e.message : e) };
  }

  try {
    await notifyTelegram(env, [
      "PAROKH GOLD · PAYMENT + ACCOUNT",
      "Order: " + order.id,
      "Plan: " + order.plan + " · $" + order.price + " USDT",
      "Name: " + (order.name || ""),
      "Email: " + order.email,
      "Broker: " + (order.broker || "—"),
      "Server: " + (order.server || "—"),
      "MT5 Account: " + (order.account || "—"),
      "TXID: " + txid,
      "Chain verify: " + (paymentVerify.ok ? "OK" : ("NO/" + (paymentVerify.code || ""))),
      "Source: " + (order.source || "site"),
      "License queue: " + (license.ok ? ("OK " + ((license.row && license.row.id) || "")) : ("FAIL " + (license.reason || ""))),
      "Action: activate EX5 after payment confirmed"
    ].join("\n"), order.id + ":txid");
  } catch (_) {}

  return json({
    ok: true,
    order: {
      id: order.id,
      paymentStatus: order.paymentStatus,
      txid: order.txid,
      broker: order.broker,
      account: order.account,
      server: order.server
    },
    paymentVerify,
    license: { ok: !!license.ok, id: license.row && license.row.id ? license.row.id : null, reason: license.reason || null }
  }, 200, request);
}

async function handleChat(request, env) {
  // thin alias: chatbot posts same as orders/support
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const intent = String(body.intent || "purchase").toLowerCase();
  if (intent === "support") {
    // reuse support shape
    const fake = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        subject: body.subject || "chatbot",
        message: body.message || ("Chatbot: " + intent),
        source: "chatbot"
      })
    });
    return handleSupport(fake, env);
  }
  // demo / purchase via orders
  const fake = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      kind: intent === "demo" ? "demo" : "full",
      plan: body.plan || (intent === "demo" ? "demo" : "12m"),
      name: body.name,
      email: body.email,
      refundAcknowledged: true,
      source: "chatbot",
      replyChannel: "email"
    })
  });
  return handleOrders(fake, env);
}

async function handleOrderPayment(request, env, path) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST" && request.method !== "PATCH") {
    return json({ error: "method" }, 405, request);
  }
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ error: "forbidden" }, 403, request);

  const m = path.match(/^\/api\/orders\/([^/]+)\/payment\/?$/);
  const orderId = m ? decodeURIComponent(m[1]) : "";
  if (!orderId) return json({ error: "id" }, 400, request);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const action = String(body.action || "").toLowerCase();
  const note = String(body.note || body.txid || "").trim().slice(0, 256);

  const orders = (await kvGetJson(env, "orders", [])) || [];
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return json({ error: "not_found" }, 404, request);
  const order = orders[idx];

  if (action === "approve" || action === "paid") {
    order.paymentStatus = "PAID";
    order.status = "PAID";
  } else if (action === "review") {
    order.paymentStatus = "PAYMENT_REVIEW";
    order.status = "PAYMENT_REVIEW";
  } else if (action === "reject") {
    order.paymentStatus = "REJECTED";
    order.status = "REJECTED";
  } else if (action === "cancel") {
    order.paymentStatus = "CANCELLED";
    order.status = "CANCELLED";
  } else if (action === "complete") {
    order.paymentStatus = "COMPLETED";
    order.status = "COMPLETED";
  } else {
    return json({ error: "invalid_action" }, 400, request);
  }
  if (note) order.adminNote = note;
  order.updatedAt = new Date().toISOString();
  orders[idx] = order;
  await kvPutJson(env, "orders", orders);

  // audit
  const logs = (await kvGetJson(env, "audit", [])) || [];
  logs.unshift({
    admin: adm.user || "admin",
    action: "order_" + action,
    target: orderId,
    at: new Date().toISOString(),
    result: "ok"
  });
  await kvPutJson(env, "audit", logs.slice(0, 2000));

  const notifs = (await kvGetJson(env, "notifs", {})) || {};
  if (!notifs[order.email]) notifs[order.email] = [];
  notifs[order.email].unshift({
    text: "Order " + order.id + " → " + order.paymentStatus,
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


async function handleAudit(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ error: "forbidden" }, 403, request);
  const logs = (await kvGetJson(env, "audit", [])) || [];
  return json({ logs: logs.slice(0, 500), durable: !!env.PAROKH_KV }, 200, request);
}

async function handleAdminNotify(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ error: "forbidden" }, 403, request);
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const text = String(body.text || "").trim().slice(0, 500);
  const email = String(body.email || "").trim().toLowerCase();
  const all = !!body.all;
  if (!text) return json({ error: "text_required" }, 400, request);
  if (!all && !email) return json({ error: "email_required" }, 400, request);
  const notifs = (await kvGetJson(env, "notifs", {})) || {};
  const item = { text: text, at: new Date().toISOString(), read: false, from: "admin" };
  if (all) {
    // broadcast to emails that already have notif buckets or from orders
    const orders = (await kvGetJson(env, "orders", [])) || [];
    const emails = new Set(Object.keys(notifs));
    orders.forEach((o) => { if (o.email) emails.add(o.email); });
    emails.forEach((e) => {
      if (!notifs[e]) notifs[e] = [];
      notifs[e].unshift(item);
      notifs[e] = notifs[e].slice(0, 100);
    });
  } else {
    if (!notifs[email]) notifs[email] = [];
    notifs[email].unshift(item);
    notifs[email] = notifs[email].slice(0, 100);
  }
  await kvPutJson(env, "notifs", notifs);
  const logs = (await kvGetJson(env, "audit", [])) || [];
  logs.unshift({ admin: adm.user || "admin", action: all ? "notify_all" : "notify_user", target: all ? "all" : email, at: new Date().toISOString(), result: "ok" });
  await kvPutJson(env, "audit", logs.slice(0, 2000));
  return json({ ok: true }, 200, request);
}

async function handleAdminStats(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const adm = await verifyAdminToken(request, env);
  if (!adm) return json({ error: "forbidden" }, 403, request);
  const orders = (await kvGetJson(env, "orders", [])) || [];
  const bans = (await kvGetJson(env, "bans", [])) || [];
  const lic = (await kvGetJson(env, "lic_req", [])) || [];
  const pendingPay = orders.filter((o) => o.paymentStatus === "PAYMENT_PENDING" || o.paymentStatus === "WAITING_FOR_PAYMENT").length;
  const reviewPay = orders.filter((o) => o.paymentStatus === "PAYMENT_REVIEW").length;
  const paid = orders.filter((o) => o.paymentStatus === "PAID" || o.paymentStatus === "COMPLETED").length;
  return json({
    totalOrders: orders.length,
    pendingPayments: pendingPay,
    paymentReviews: reviewPay,
    paidOrders: paid,
    bannedUsers: bans.length,
    licenseRequests: lic.length,
    pendingLicenses: lic.filter((r) => r.status === "pending").length,
    durable: !!env.PAROKH_KV
  }, 200, request);
}




/* ========== TRON USDT verify (aligned with sales bot) ========== */
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

async function verifyUsdtTrc20Tx(env, txid, expectedAmount) {
  const ourWallet = String(env.PAYMENT_WALLET_ADDRESS || env.PAYMENT_ADDRESS_TRC20 || "").trim();
  if (!ourWallet) return { ok: false, code: "wallet_not_configured" };
  if (!txid || txid.length < 20) return { ok: false, code: "invalid_txid" };

  const headers = { Accept: "application/json" };
  if (env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = env.TRONGRID_API_KEY;
  const base = String(env.TRON_RPC_URL || "https://api.trongrid.io").replace(/\/$/, "");

  let info = null;
  try {
    const infoRes = await fetch(base + "/wallet/gettransactioninfobyid", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ value: txid }),
    });
    if (infoRes.ok) info = await infoRes.json();
  } catch (e) {
    return { ok: false, code: "network", detail: String(e && e.message ? e.message : e) };
  }
  if (!info || !info.id) return { ok: false, code: "not_found" };
  if (info.receipt && info.receipt.result && info.receipt.result !== "SUCCESS") {
    return { ok: false, code: "failed_on_chain" };
  }
  if (!info.blockNumber && !info.block_number) return { ok: false, code: "pending" };

  let amountFound = 0;
  let matchedWallet = false;
  try {
    const evRes = await fetch(base + "/v1/transactions/" + encodeURIComponent(txid) + "/events", {
      method: "GET",
      headers,
    });
    if (evRes.ok) {
      const evJson = await evRes.json();
      const events = (evJson && evJson.data) || [];
      for (const ev of events) {
        const caddr = String(ev.contract_address || ev.contractAddress || "");
        const ename = String(ev.event_name || ev.name || "");
        const isUsdt =
          caddr === USDT_TRC20_CONTRACT ||
          caddr.toLowerCase().indexOf("a614f803b6fd780986a42c78ec9c7f77e6ded13c") !== -1;
        if (ename && ename !== "Transfer") continue;
        if (!isUsdt && ename !== "Transfer") continue;
        const res = ev.result || ev.result_map || {};
        const to = String(res.to || res["1"] || res._to || "");
        const val = res.value || res["2"] || res._value || "0";
        const human = Number(val) / 1e6;
        if (human > 0) amountFound = Math.max(amountFound, human);
        if (to === ourWallet || to.indexOf(ourWallet) !== -1) {
          matchedWallet = true;
          amountFound = human || amountFound;
        }
      }
    }
  } catch (_) {}

  // fallback: accept if tx succeeded and amount meets plan when wallet match uncertain (hex addr)
  const need = Number(expectedAmount) || 0;
  if (matchedWallet && amountFound + 1e-6 >= need) {
    return { ok: true, amount: amountFound, wallet: ourWallet, code: "verified" };
  }
  if (amountFound + 1e-6 >= need && info.blockNumber) {
    // amount ok but wallet string form may differ (hex vs base58) → mark review
    return { ok: false, code: "amount_ok_wallet_review", amount: amountFound, wallet: ourWallet };
  }
  if (!matchedWallet && amountFound === 0) {
    return { ok: false, code: "no_usdt_transfer", wallet: ourWallet };
  }
  if (amountFound + 1e-6 < need) {
    return { ok: false, code: "amount_low", amount: amountFound, expected: need };
  }
  return { ok: false, code: "review", amount: amountFound, wallet: ourWallet };
}

/* ========== Supabase + License Admin (same flow as sales bot) ========== */
async function sbRest(env, table, method, body, query) {
  method = method || "GET";
  query = query || "";
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error("supabase_config_missing");
  }
  const base = String(env.SUPABASE_URL).replace(/\/$/, "");
  const url = base + "/rest/v1/" + table + query;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers["Prefer"] = "return=representation";
  const opts = { method, headers };
  if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Supabase " + res.status + ": " + errText.slice(0, 300));
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

function planToLicense(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === "1m" || p === "1" || p === "month") return "1m";
  if (p === "6m" || p === "6") return "6m";
  if (p === "12m" || p === "12" || p === "year") return "12m";
  return "1m";
}

async function createLicenseRequestFromSite(env, order) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return { ok: false, reason: "supabase_not_configured" };
  }
  const plan = planToLicense(order.plan);
  let mt5 = null;
  if (order.account != null && String(order.account).trim() !== "") {
    const n = Number(String(order.account).replace(/[^\d]/g, ""));
    if (!Number.isNaN(n) && n > 0) mt5 = n;
  }
  let payStat = "txid_submitted";
  if (order.paymentStatus === "PAID_VERIFIED") payStat = "paid";
  else if (order.paymentStatus === "TXID_PENDING") payStat = "pending_payment";
  const body = {
    request_type: "purchase",
    status: "waiting_activate",
    mt5_account: mt5,
    broker_name: order.broker || null,
    server_name: order.server || null,
    plan: plan,
    customer_email: order.email || null,
    customer_tg_id: null,
    order_ref: String(order.id || order.txid || ""),
    payment_status: payStat,
    notes: "website; source=" + String(order.source || "website") + "; txid=" + String(order.txid || ""),
    source: "website",
  };
  try {
    const rows = await sbRest(env, "license_requests", "POST", body, "");
    if (Array.isArray(rows) && rows[0] && rows[0].id) return { ok: true, row: rows[0] };
    if (rows && rows.id) return { ok: true, row: rows };
    return { ok: false, reason: "no_row", detail: rows };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function notifyLicenseAdmins(env, requestRow, extra) {
  const token = env.LICENSE_BOT_TOKEN;
  if (!token) return { ok: false, reason: "LICENSE_BOT_TOKEN not set" };
  const ids = String(env.LICENSE_ADMIN_CHAT_IDS || env.ADMIN_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return { ok: false, reason: "no_admin_chat_ids" };

  const reqId = requestRow && requestRow.id ? String(requestRow.id) : "";
  const account = (requestRow && requestRow.mt5_account) || (extra && extra.account) || "—";
  const plan = (requestRow && requestRow.plan) || (extra && extra.plan) || "—";
  const broker = (requestRow && requestRow.broker_name) || (extra && extra.broker) || "—";
  const server = (requestRow && requestRow.server_name) || (extra && extra.server) || broker;
  const pay = (requestRow && requestRow.payment_status) || "—";
  const email = (requestRow && requestRow.customer_email) || (extra && extra.email) || "—";
  const orderRef = (requestRow && requestRow.order_ref) || (extra && extra.orderId) || "—";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text =
    "🛒 <b>درخواست لایسنس جدید</b>\n\n" +
    "<b>حساب:</b> <code>" + esc(account) + "</code>\n" +
    "<b>پلن:</b> " + esc(plan) + "\n" +
    "<b>Broker:</b> " + esc(broker) + "\n" +
    "<b>Server:</b> " + esc(server) + "\n" +
    "<b>Email:</b> " + esc(email) + "\n" +
    "<b>Order:</b> <code>" + esc(orderRef) + "</code>\n" +
    "<b>پرداخت:</b> " + esc(pay) + " | USDT TRC-20\n" +
    "<b>منبع:</b> وب‌سایت";

  const reply_markup = reqId
    ? {
        inline_keyboard: [[
          { text: "✅ فعال‌سازی", callback_data: "reqact:" + reqId },
          { text: "❌ رد", callback_data: "reqrej:" + reqId },
        ]],
      }
    : undefined;

  let sent = 0;
  for (const chatId of ids) {
    try {
      const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          reply_markup,
          disable_web_page_preview: true,
        }),
      });
      if (r.ok) sent++;
    } catch (_) {}
  }
  return { ok: sent > 0, sent };
}


async function notifyTelegram(env, text, dedupeKey) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.ADMIN_CHAT_ID;
  if (!token || !chat) return { ok: false, reason: "telegram_not_configured" };
  try {
    if (dedupeKey && env.PAROKH_KV) {
      const k = "tg_once:" + String(dedupeKey).slice(0, 120);
      const prev = await env.PAROKH_KV.get(k);
      if (prev) return { ok: true, deduped: true };
      await env.PAROKH_KV.put(k, "1", { expirationTtl: 120 });
    }
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: String(text).slice(0, 3900),
        disable_web_page_preview: true
      })
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, reason: "tg_http", detail: t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function handleSupport(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  const adm = await verifyAdminToken(request, env);
  const tickets = (await kvGetJson(env, "support_tickets", [])) || [];

  if (request.method === "GET") {
    if (!adm) return json({ error: "forbidden" }, 403, request);
    return json({ tickets: tickets.slice().reverse(), durable: !!env.PAROKH_KV }, 200, request);
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const name = String(body.name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
    const subject = String(body.subject || "general").trim().slice(0, 80);
    const message = String(body.message || "").trim().slice(0, 4000);
    const orderId = String(body.orderId || body.order_id || "").trim().slice(0, 80);
    const source = String(body.source || "form").trim().slice(0, 40);
    if (!email || !message) return json({ error: "email_message_required" }, 400, request);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400, request);

    const row = {
      id: "T" + Date.now().toString(36).toUpperCase(),
      name,
      email,
      subject,
      message,
      orderId: orderId || null,
      source,
      status: "new",
      at: new Date().toISOString()
    };
    const next = tickets.concat([row]).slice(-2000);
    await kvPutJson(env, "support_tickets", next);

    const tgText =
      "PAROKH GOLD — Support\n" +
      "ID: " + row.id + "\n" +
      "Source: " + source + "\n" +
      "Subject: " + subject + "\n" +
      "Name: " + (name || "—") + "\n" +
      "Email: " + email + "\n" +
      (orderId ? "Order: " + orderId + "\n" : "") +
      "Time: " + row.at + "\n\n" +
      message;

    const tg = await notifyTelegram(env, tgText);

    return json({
      ok: true,
      ticket: { id: row.id, status: row.status, at: row.at },
      telegram: tg.ok,
      durable: !!env.PAROKH_KV
    }, 200, request);
  }

  if (request.method === "PATCH") {
    if (!adm) return json({ error: "forbidden" }, 403, request);
    let body = {};
    try { body = await request.json(); } catch (_) {}
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim();
    if (!id) return json({ error: "id_required" }, 400, request);
    const idx = tickets.findIndex((t) => t.id === id);
    if (idx < 0) return json({ error: "not_found" }, 404, request);
    if (status) tickets[idx].status = status;
    tickets[idx].updatedAt = new Date().toISOString();
    await kvPutJson(env, "support_tickets", tickets);
    return json({ ok: true, ticket: tickets[idx] }, 200, request);
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
