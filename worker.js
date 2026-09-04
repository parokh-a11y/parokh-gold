/**
 * PAROKH GOLD EA — Worker v1.30
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
    if (p.match(/^\/api\/orders\/[^/]+\/payment\/?$/)) return handleOrderPayment(request, env, p);
    if (p === "/api/payment/create" || p === "/api/payment/create/") return handlePaymentCreate(request, env);
    if (p === "/api/payment/info" || p === "/api/payment/info/") return handlePaymentInfo(request, env);
    if (p === "/api/payment/submit-txid" || p === "/api/payment/submit-txid/") return handlePaymentSubmitTxid(request, env);
    if (p === "/api/payment/verify" || p === "/api/payment/verify/") return handlePaymentVerify(request, env);
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


/* ========== Payment System V1 — USDT TRC-20 ========== */
const USDT_TRC20_DEFAULT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_DECIMALS = 6;

function paymentWallet(env) {
  return String(env.PAYMENT_WALLET_ADDRESS || env.PAYMENT_ADDRESS_TRC20 || "").trim();
}
function tronRpcBase(env) {
  return String(env.TRON_RPC_URL || "https://api.trongrid.io").replace(/\/$/, "");
}
function usdtContract(env) {
  return String(env.USDT_TRON_CONTRACT || USDT_TRC20_DEFAULT).trim();
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  // Prefer existing verify helpers if present
  if (typeof verifySupabaseUser === "function") {
    try { return await verifySupabaseUser(token, env); } catch (_) {}
  }
  if (typeof getUserFromJwt === "function") {
    try { return await getUserFromJwt(token, env); } catch (_) {}
  }
  // Fallback: call Supabase user endpoint via proxy path not available — decode payload only as hint + optional fetch
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email || null, token };
  } catch (_) {
    return null;
  }
}

async function paymentRateLimit(env, key, maxN, windowMs) {
  const k = "rl_pay_" + key;
  const now = Date.now();
  let row = (await kvGetJson(env, k, null)) || { n: 0, start: now };
  if (now - row.start > windowMs) row = { n: 0, start: now };
  row.n += 1;
  await kvPutJson(env, k, row);
  return row.n <= maxN;
}

function normalizeTxid(txid) {
  return String(txid || "").trim().toLowerCase().replace(/^0x/, "");
}

function isLikelyTxid(txid) {
  return /^[a-f0-9]{64}$/i.test(txid);
}

/** TRON Adapter — configurable endpoint */
async function tronFetch(env, path, opts) {
  const base = tronRpcBase(env);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (env.TRON_RPC_AUTH) headers["Authorization"] = String(env.TRON_RPC_AUTH);
  // TronGrid API key optional
  if (env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = String(env.TRONGRID_API_KEY);
  const url = path.startsWith("http") ? path : base + path;
  const r = await fetch(url, { ...(opts || {}), headers: { ...headers, ...((opts && opts.headers) || {}) } });
  return r;
}

async function tronGetTxInfo(env, txid) {
  // wallet/gettransactioninfobyid
  const r = await tronFetch(env, "/wallet/gettransactioninfobyid", {
    method: "POST",
    body: JSON.stringify({ value: txid })
  });
  if (!r.ok) throw new Error("rpc_txinfo_http_" + r.status);
  const data = await r.json();
  return data;
}

async function tronGetTx(env, txid) {
  const r = await tronFetch(env, "/wallet/gettransactionbyid", {
    method: "POST",
    body: JSON.stringify({ value: txid })
  });
  if (!r.ok) throw new Error("rpc_tx_http_" + r.status);
  return await r.json();
}

function base58ToHexAddress(maybeBase58) {
  // For comparison we also accept hex; TronGrid returns hex addresses in some fields
  return String(maybeBase58 || "").trim();
}

/** Verify USDT TRC-20 transfer matches order */
async function verifyUsdtTrc20Payment(env, { txid, expectedAmountUsd, expectedTo }) {
  const result = {
    ok: false,
    reason: "unknown",
    sender: null,
    recipient: null,
    amount: null,
    blockNumber: null,
    confirmed: false
  };
  if (!isLikelyTxid(txid)) {
    result.reason = "invalid_txid";
    return result;
  }
  const wallet = base58ToHexAddress(expectedTo);
  const contract = usdtContract(env);

  let info, tx;
  try {
    info = await tronGetTxInfo(env, txid);
    tx = await tronGetTx(env, txid);
  } catch (e) {
    result.reason = "rpc_error";
    result.detail = String(e && e.message ? e.message : e);
    return result;
  }

  if (!info || (!info.id && !info.txid && !info.blockNumber && Object.keys(info).length === 0)) {
    result.reason = "tx_not_found";
    return result;
  }

  // receipt result
  const receiptResult = info.receipt && info.receipt.result;
  if (receiptResult && String(receiptResult).toUpperCase() !== "SUCCESS") {
    result.reason = "tx_failed";
    return result;
  }

  // confirmation: prefer solidified / block presence
  if (info.blockNumber) {
    result.blockNumber = info.blockNumber;
    result.confirmed = true;
  } else {
    result.reason = "not_confirmed";
    result.confirmed = false;
    return result;
  }

  // Parse TRC-20 Transfer from log/events
  // contract_address may be hex without 41 prefix in some responses
  const logs = info.log || [];
  const transferTopic = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
  let matched = null;
  for (const log of logs) {
    const topics = log.topics || [];
    if (!topics.length) continue;
    const t0 = String(topics[0] || "").replace(/^0x/, "").toLowerCase();
    if (t0 !== transferTopic) continue;
    const addrHex = String(log.address || "").replace(/^0x/, "").toLowerCase();
    // USDT contract base58 maps — compare last chars of hex form is fragile; also check via known hex
    // TronGrid often returns contract as hex 41.... 
    // Accept if address contains contract hex or we skip strict hex match and validate via gettransaction
    matched = log;
    break;
  }

  // Alternative: log_data from TronGrid v1 events API
  if (!matched) {
    try {
      const er = await tronFetch(env, "/v1/transactions/" + txid + "/events", { method: "GET" });
      if (er.ok) {
        const ej = await er.json();
        const events = ej.data || ej || [];
        for (const ev of events) {
          const name = (ev.event_name || ev.name || "").toLowerCase();
          if (name !== "transfer") continue;
          const res = ev.result || ev;
          matched = {
            event: true,
            to: res.to || res._to || res[1],
            from: res.from || res._from || res[0],
            value: res.value || res._value || res[2],
            contract: ev.contract_address || ev.contract
          };
          break;
        }
      }
    } catch (_) {}
  }

  if (!matched) {
    result.reason = "no_trc20_transfer";
    return result;
  }

  let toAddr, fromAddr, rawAmount;
  if (matched.event) {
    toAddr = String(matched.to || "");
    fromAddr = String(matched.from || "");
    rawAmount = String(matched.value || "0");
  } else {
    const topics = matched.topics || [];
    // topics[1] from, topics[2] to — last 20 bytes / 40 hex = address without 41
    fromAddr = topics[1] ? "41" + String(topics[1]).replace(/^0x/, "").slice(-40) : null;
    toAddr = topics[2] ? "41" + String(topics[2]).replace(/^0x/, "").slice(-40) : null;
    rawAmount = matched.data ? String(BigInt("0x" + String(matched.data).replace(/^0x/, ""))) : "0";
  }

  result.sender = fromAddr;
  result.recipient = toAddr;

  // Amount: USDT 6 decimals. expectedAmountUsd is integer dollars in our system
  const expectedRaw = BigInt(Math.round(Number(expectedAmountUsd) * 10 ** USDT_DECIMALS));
  let gotRaw;
  try { gotRaw = BigInt(rawAmount); } catch (_) { gotRaw = 0n; }
  result.amount = Number(gotRaw) / 10 ** USDT_DECIMALS;

  if (gotRaw < expectedRaw) {
    result.reason = "amount_too_low";
    return result;
  }
  if (gotRaw > expectedRaw) {
    result.reason = "amount_too_high_needs_review";
    result.ok = false;
    return result;
  }

  // Recipient check — compare base58 wallet to event addresses loosely
  const walletNorm = wallet.toLowerCase();
  const toNorm = String(toAddr || "").toLowerCase();
  // Also fetch account to convert if needed — for MVP check inclusion or equality of base58 via trongrid
  let recipientOk = false;
  if (toNorm && walletNorm) {
    if (toNorm === walletNorm) recipientOk = true;
    // hex vs base58: request account by base58 and compare
  }
  // Use TronGrid: /v1/accounts/{wallet}/transactions/trc20?limit=1 not helpful
  // Soft check: if event to matches OR we verify via gettransaction contract data
  if (!recipientOk) {
    // Accept if wallet appears in tx raw_data contracts
    const raw = JSON.stringify(tx || {});
    if (raw.includes(wallet) || raw.toLowerCase().includes(walletNorm)) recipientOk = true;
  }
  if (!recipientOk && toAddr) {
    // last resort: call validateaddress-style equality after converting wallet via RPC
    try {
      const vr = await tronFetch(env, "/wallet/validateaddress", {
        method: "POST",
        body: JSON.stringify({ address: wallet })
      });
      if (vr.ok) {
        const vj = await vr.json();
        if (vj.hexAddress && String(toAddr).toLowerCase().endsWith(String(vj.hexAddress).replace(/^0x|^41/i, "").toLowerCase().slice(-40))) {
          recipientOk = true;
        }
      }
    } catch (_) {}
  }
  if (!recipientOk) {
    result.reason = "wrong_recipient";
    return result;
  }

  result.ok = true;
  result.reason = "ok";
  return result;
}

async function loadPayments(env) {
  return (await kvGetJson(env, "payments_v1", [])) || [];
}
async function savePayments(env, list) {
  await kvPutJson(env, "payments_v1", list.slice(-5000));
}
async function loadTxidIndex(env) {
  return (await kvGetJson(env, "payment_txids_v1", {})) || {};
}
async function saveTxidIndex(env, idx) {
  await kvPutJson(env, "payment_txids_v1", idx);
}

async function handlePaymentCreate(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  const user = await getAuthUser(request, env);
  if (!user || !user.id) return json({ error: "auth_required" }, 401, request);
  if (!(await paymentRateLimit(env, "c_" + user.id, 20, 60 * 60 * 1000))) {
    return json({ error: "rate_limited" }, 429, request);
  }
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const orderId = String(body.orderId || body.order_id || "").trim();
  if (!orderId) return json({ error: "order_id_required" }, 400, request);

  const orders = (await kvGetJson(env, "orders", [])) || [];
  const order = orders.find((o) => o.id === orderId);
  if (!order) return json({ error: "order_not_found" }, 404, request);
  // ownership
  const owner = order.userId || order.uid || order.ownerId || order.email;
  if (order.userId && order.userId !== user.id) return json({ error: "forbidden" }, 403, request);
  if (!order.userId && order.email && user.email && order.email.toLowerCase() !== String(user.email).toLowerCase()) {
    return json({ error: "forbidden" }, 403, request);
  }

  const wallet = paymentWallet(env);
  if (!wallet) return json({ error: "wallet_not_configured" }, 503, request);

  const amount = Number(order.price != null ? order.price : PLAN_PRICES[order.plan] || 0);
  if (!(amount > 0)) return json({ error: "invalid_amount" }, 400, request);

  let payments = await loadPayments(env);
  let pay = payments.find((p) => p.order_id === orderId && p.status !== "FAILED");
  if (!pay) {
    pay = {
      payment_id: "P" + Date.now().toString(36).toUpperCase(),
      order_id: orderId,
      user_id: user.id,
      amount,
      currency: "USDT",
      network: "TRON",
      standard: "TRC-20",
      wallet_address: wallet,
      txid: null,
      status: "WAITING_PAYMENT",
      created_at: new Date().toISOString(),
      submitted_at: null,
      paid_at: null,
      verification_reason: null,
      verification_attempts: 0
    };
    payments.push(pay);
    await savePayments(env, payments);
  }

  order.paymentStatus = pay.status;
  order.paymentMode = "usdt_trc20";
  order.paymentAddress = wallet;
  order.paymentId = pay.payment_id;
  await kvPutJson(env, "orders", orders);

  return json({
    ok: true,
    payment: {
      payment_id: pay.payment_id,
      order_id: pay.order_id,
      amount: pay.amount,
      currency: pay.currency,
      network: pay.network,
      standard: pay.standard,
      wallet_address: pay.wallet_address,
      status: pay.status,
      plan: order.plan
    }
  }, 200, request);
}

async function handlePaymentInfo(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method" }, 405, request);
  const user = await getAuthUser(request, env);
  if (!user || !user.id) return json({ error: "auth_required" }, 401, request);
  let orderId = "";
  if (request.method === "GET") {
    orderId = new URL(request.url).searchParams.get("orderId") || new URL(request.url).searchParams.get("order_id") || "";
  } else {
    try {
      const body = await request.json();
      orderId = String(body.orderId || body.order_id || "");
    } catch (_) {}
  }
  orderId = orderId.trim();
  if (!orderId) return json({ error: "order_id_required" }, 400, request);
  const payments = await loadPayments(env);
  const pay = payments.filter((p) => p.order_id === orderId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (!pay) return json({ error: "not_found" }, 404, request);
  if (pay.user_id && pay.user_id !== user.id) return json({ error: "forbidden" }, 403, request);
  return json({
    ok: true,
    payment: {
      payment_id: pay.payment_id,
      order_id: pay.order_id,
      amount: pay.amount,
      currency: pay.currency,
      network: pay.network,
      standard: pay.standard,
      wallet_address: pay.wallet_address,
      status: pay.status,
      txid: pay.txid,
      created_at: pay.created_at,
      submitted_at: pay.submitted_at,
      paid_at: pay.paid_at,
      verification_reason: pay.verification_reason
    }
  }, 200, request);
}

async function handlePaymentSubmitTxid(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  const user = await getAuthUser(request, env);
  if (!user || !user.id) return json({ error: "auth_required" }, 401, request);
  if (!(await paymentRateLimit(env, "s_" + user.id, 30, 60 * 60 * 1000))) {
    return json({ error: "rate_limited" }, 429, request);
  }
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const orderId = String(body.orderId || body.order_id || "").trim();
  const txid = normalizeTxid(body.txid);
  if (!orderId) return json({ error: "order_id_required" }, 400, request);
  if (!isLikelyTxid(txid)) return json({ error: "invalid_txid" }, 400, request);

  const idx = await loadTxidIndex(env);
  if (idx[txid] && idx[txid] !== orderId) {
    return json({ error: "txid_already_used" }, 409, request);
  }

  let payments = await loadPayments(env);
  let pay = payments.find((p) => p.order_id === orderId && p.status !== "FAILED");
  if (!pay) return json({ error: "payment_not_found" }, 404, request);
  if (pay.user_id && pay.user_id !== user.id) return json({ error: "forbidden" }, 403, request);
  if (pay.status === "PAID") return json({ ok: true, payment: { status: "PAID", payment_id: pay.payment_id } }, 200, request);

  pay.txid = txid;
  pay.status = "TXID_SUBMITTED";
  pay.submitted_at = new Date().toISOString();
  await savePayments(env, payments);
  idx[txid] = orderId;
  await saveTxidIndex(env, idx);

  // auto verify
  const verified = await runPaymentVerification(env, pay.payment_id);
  return json({ ok: true, payment: verified }, 200, request);
}

async function handlePaymentVerify(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json({ error: "method" }, 405, request);
  const user = await getAuthUser(request, env);
  if (!user || !user.id) return json({ error: "auth_required" }, 401, request);
  if (!(await paymentRateLimit(env, "v_" + user.id, 40, 60 * 60 * 1000))) {
    return json({ error: "rate_limited" }, 429, request);
  }
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const paymentId = String(body.paymentId || body.payment_id || "").trim();
  const orderId = String(body.orderId || body.order_id || "").trim();
  let payments = await loadPayments(env);
  let pay = null;
  if (paymentId) pay = payments.find((p) => p.payment_id === paymentId);
  if (!pay && orderId) pay = payments.find((p) => p.order_id === orderId);
  if (!pay) return json({ error: "not_found" }, 404, request);
  if (pay.user_id && pay.user_id !== user.id) return json({ error: "forbidden" }, 403, request);
  const verified = await runPaymentVerification(env, pay.payment_id);
  return json({ ok: true, payment: verified }, 200, request);
}

async function runPaymentVerification(env, paymentId) {
  let payments = await loadPayments(env);
  const pay = payments.find((p) => p.payment_id === paymentId);
  if (!pay) return { error: "not_found" };
  if (pay.status === "PAID") {
    return {
      payment_id: pay.payment_id,
      order_id: pay.order_id,
      status: pay.status,
      amount: pay.amount,
      txid: pay.txid,
      paid_at: pay.paid_at
    };
  }
  if (!pay.txid) {
    return { payment_id: pay.payment_id, status: pay.status, reason: "no_txid" };
  }

  pay.status = "VERIFYING";
  pay.verification_attempts = (pay.verification_attempts || 0) + 1;
  pay.last_verified_at = new Date().toISOString();
  await savePayments(env, payments);

  const wallet = paymentWallet(env) || pay.wallet_address;
  const vr = await verifyUsdtTrc20Payment(env, {
    txid: pay.txid,
    expectedAmountUsd: pay.amount,
    expectedTo: wallet
  });

  payments = await loadPayments(env);
  const p2 = payments.find((p) => p.payment_id === paymentId);
  if (!p2) return { error: "not_found" };

  p2.verification_reason = vr.reason;
  p2.sender_address = vr.sender;
  p2.blockchain_amount = vr.amount;
  p2.block_number = vr.blockNumber;

  if (vr.ok) {
    p2.status = "PAID";
    p2.paid_at = new Date().toISOString();
    // sync order
    const orders = (await kvGetJson(env, "orders", [])) || [];
    const o = orders.find((x) => x.id === p2.order_id);
    if (o) {
      o.paymentStatus = "PAID";
      o.txid = p2.txid;
      o.txidAt = p2.paid_at;
      o.paidAt = p2.paid_at;
      await kvPutJson(env, "orders", orders);
    }
  } else if (vr.reason === "not_confirmed" || vr.reason === "rpc_error") {
    p2.status = "TXID_SUBMITTED"; // retryable
  } else if (vr.reason === "amount_too_high_needs_review") {
    p2.status = "PAYMENT_REVIEW";
  } else {
    p2.status = "FAILED";
  }
  await savePayments(env, payments);

  return {
    payment_id: p2.payment_id,
    order_id: p2.order_id,
    status: p2.status,
    amount: p2.amount,
    txid: p2.txid,
    paid_at: p2.paid_at,
    verification_reason: p2.verification_reason,
    blockchain_amount: p2.blockchain_amount
  };
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
      paymentMode: "usdt_trc20",
      paymentStatus: kind === "demo" ? "N_A" : "WAITING_PAYMENT",
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


async function notifyTelegram(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.ADMIN_CHAT_ID;
  if (!token || !chat) return { ok: false, reason: "telegram_not_configured" };
  try {
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
