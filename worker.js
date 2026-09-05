/**
 * PAROKH GOLD EA — Worker v1.31.1
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
    if (p === "/api/license-requests" || p === "/api/license-requests/") return json({ error: "gone", message: "License requests removed. Use Order + Payment." }, 410, request);

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
  // Source of truth: verifySupabaseUser (JWT validated against Supabase)
  try {
    const u = await verifySupabaseUser(request, env);
    if (u && (u.id || u.sub || u.email)) {
      return {
        id: u.id || u.sub,
        email: u.email || null,
        token: null
      };
    }
  } catch (_) {}
  return null;
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
    amount_raw: null,
    blockNumber: null,
    confirmed: false,
    contract: null
  };
  if (!isLikelyTxid(txid)) {
    result.reason = "invalid_txid";
    return result;
  }
  const walletB58 = String(expectedTo || paymentWallet(env) || "").trim();
  const contractB58 = usdtContract(env);

  let info, tx;
  try {
    info = await tronGetTxInfo(env, txid);
    tx = await tronGetTx(env, txid);
  } catch (e) {
    result.reason = "rpc_error";
    result.detail = String(e && e.message ? e.message : e);
    return result;
  }

  if (!info || (typeof info === "object" && !info.id && !info.txid && info.blockNumber == null && !(info.log && info.log.length))) {
    // empty object = not found
    if (!tx || !tx.txID) {
      result.reason = "tx_not_found";
      return result;
    }
  }

  const receiptResult = info && info.receipt && info.receipt.result;
  if (receiptResult && String(receiptResult).toUpperCase() !== "SUCCESS") {
    result.reason = "tx_failed";
    return result;
  }

  if (info && info.blockNumber) {
    result.blockNumber = info.blockNumber;
    result.confirmed = true;
  } else {
    result.reason = "not_confirmed";
    result.confirmed = false;
    return result;
  }

  // Resolve contract + wallet to hex for strict compare
  async function toHexAddress(addr) {
    if (!addr) return null;
    const a = String(addr).trim();
    if (/^41[a-fA-F0-9]{40}$/.test(a)) return a.toLowerCase();
    if (/^[a-fA-F0-9]{40}$/.test(a)) return ("41" + a).toLowerCase();
    try {
      const r = await tronFetch(env, "/wallet/validateaddress", {
        method: "POST",
        body: JSON.stringify({ address: a })
      });
      if (r.ok) {
        const j = await r.json();
        if (j.hexAddress) return String(j.hexAddress).replace(/^0x/i, "").toLowerCase();
      }
    } catch (_) {}
    return null;
  }

  const walletHex = await toHexAddress(walletB58);
  const contractHex = await toHexAddress(contractB58);

  // Primary: TronGrid events API for typed Transfer
  let transfer = null;
  try {
    const er = await tronFetch(env, "/v1/transactions/" + txid + "/events", { method: "GET" });
    if (er.ok) {
      const ej = await er.json();
      const events = ej.data || [];
      for (const ev of events) {
        const name = String(ev.event_name || ev.name || "").toLowerCase();
        if (name !== "transfer") continue;
        const c = String(ev.contract_address || ev.contract || "").trim();
        const cHex = await toHexAddress(c);
        // Strict USDT contract match
        if (contractHex && cHex && cHex !== contractHex) continue;
        if (contractB58 && c && c !== contractB58 && !(cHex && contractHex && cHex === contractHex)) {
          // allow only if hex matched; if neither matches skip
          if (!(cHex && contractHex && cHex === contractHex)) continue;
        }
        const res = ev.result || {};
        transfer = {
          from: res.from || res._from || res["0"],
          to: res.to || res._to || res["1"],
          value: String(res.value || res._value || res["2"] || "0"),
          contract: c
        };
        result.contract = c;
        break;
      }
    }
  } catch (_) {}

  // Fallback: parse logs with Transfer topic + contract address match
  if (!transfer && info && Array.isArray(info.log)) {
    const transferTopic = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    for (const log of info.log) {
      const topics = log.topics || [];
      if (!topics.length) continue;
      const t0 = String(topics[0] || "").replace(/^0x/, "").toLowerCase();
      if (t0 !== transferTopic) continue;
      const logAddr = String(log.address || "").replace(/^0x/, "").toLowerCase();
      const logAddr41 = logAddr.startsWith("41") ? logAddr : ("41" + logAddr.slice(-40));
      if (contractHex && logAddr41 !== contractHex && logAddr !== contractHex.replace(/^41/, "")) {
        // not USDT contract
        continue;
      }
      const from = topics[1] ? ("41" + String(topics[1]).replace(/^0x/, "").slice(-40).toLowerCase()) : null;
      const to = topics[2] ? ("41" + String(topics[2]).replace(/^0x/, "").slice(-40).toLowerCase()) : null;
      let value = "0";
      try {
        value = String(BigInt("0x" + String(log.data || "0").replace(/^0x/, "")));
      } catch (_) {}
      transfer = { from, to, value, contract: logAddr41 };
      result.contract = logAddr41;
      break;
    }
  }

  if (!transfer) {
    result.reason = "no_usdt_transfer";
    return result;
  }

  // Contract strict
  if (contractHex) {
    const tHex = await toHexAddress(transfer.contract);
    if (tHex && tHex !== contractHex) {
      result.reason = "wrong_token";
      return result;
    }
  }

  const toHex = await toHexAddress(transfer.to);
  const fromHex = await toHexAddress(transfer.from);
  result.sender = transfer.from;
  result.recipient = transfer.to;

  if (!walletHex || !toHex || walletHex !== toHex) {
    result.reason = "wrong_recipient";
    return result;
  }

  const expectedRaw = BigInt(Math.round(Number(expectedAmountUsd) * 10 ** USDT_DECIMALS));
  let gotRaw = 0n;
  try { gotRaw = BigInt(transfer.value); } catch (_) { gotRaw = 0n; }
  result.amount_raw = gotRaw.toString();
  result.amount = Number(gotRaw) / 10 ** USDT_DECIMALS;

  if (gotRaw < expectedRaw) {
    result.reason = "amount_too_low";
    return result;
  }
  if (gotRaw > expectedRaw) {
    result.reason = "amount_too_high_needs_review";
    return result;
  }

  result.ok = true;
  result.reason = "ok";
  return result;
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


/* ===== Payment storage: Supabase = Source of Truth (KV cache only) ===== */
async function supabaseHeaders(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return {
    url,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }
  };
}

function paymentRowFromDb(row) {
  if (!row) return null;
  return {
    payment_id: row.payment_id,
    order_id: row.order_id,
    user_id: row.user_id,
    amount: Number(row.amount),
    currency: row.currency || "USDT",
    network: row.network || "TRON",
    standard: "TRC-20",
    wallet_address: row.wallet_address,
    txid: row.txid || null,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    paid_at: row.paid_at,
    sender_address: row.sender_address || null,
    block_number: row.block_number || null,
    amount_raw: row.amount_raw || null,
    verification_reason: row.verification_result || row.verification_reason || null,
    verification_attempts: row.verification_attempts || 0,
    last_verified_at: row.last_verified_at || null
  };
}

async function sbSelectPayments(env, query) {
  const sb = await supabaseHeaders(env);
  if (!sb) return null;
  try {
    const r = await fetch(sb.url + "/rest/v1/payments?" + query, { headers: sb.headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

async function sbInsertPayment(env, pay) {
  const sb = await supabaseHeaders(env);
  if (!sb) return { ok: false, reason: "supabase_not_configured" };
  try {
    const r = await fetch(sb.url + "/rest/v1/payments", {
      method: "POST",
      headers: { ...sb.headers, Prefer: "return=representation" },
      body: JSON.stringify([{
        payment_id: pay.payment_id,
        order_id: pay.order_id,
        user_id: pay.user_id || null,
        amount: pay.amount,
        currency: pay.currency || "USDT",
        network: pay.network || "TRON",
        wallet_address: pay.wallet_address,
        txid: pay.txid || null,
        status: pay.status,
        created_at: pay.created_at || new Date().toISOString(),
        submitted_at: pay.submitted_at || null,
        paid_at: pay.paid_at || null,
        sender_address: pay.sender_address || null,
        block_number: pay.block_number || null,
        amount_raw: pay.amount_raw || null,
        verification_result: pay.verification_reason || null,
        verification_attempts: pay.verification_attempts || 0,
        last_verified_at: pay.last_verified_at || null
      }])
    });
    const txt = await r.text();
    if (r.status === 409 || (txt && txt.toLowerCase().includes("duplicate"))) {
      return { ok: false, reason: "duplicate", status: 409 };
    }
    if (!r.ok) return { ok: false, reason: "insert_failed", detail: txt.slice(0, 200), status: r.status };
    const rows = JSON.parse(txt || "[]");
    return { ok: true, row: paymentRowFromDb(rows[0] || pay) };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function sbUpdatePayment(env, paymentId, patch) {
  const sb = await supabaseHeaders(env);
  if (!sb) return { ok: false, reason: "supabase_not_configured" };
  try {
    const body = {};
    const map = {
      txid: "txid",
      status: "status",
      submitted_at: "submitted_at",
      paid_at: "paid_at",
      sender_address: "sender_address",
      block_number: "block_number",
      amount_raw: "amount_raw",
      verification_reason: "verification_result",
      verification_attempts: "verification_attempts",
      last_verified_at: "last_verified_at",
      wallet_address: "wallet_address",
      amount: "amount"
    };
    for (const k of Object.keys(patch || {})) {
      if (map[k]) body[map[k]] = patch[k];
      else if (k === "verification_result") body.verification_result = patch[k];
    }
    const r = await fetch(sb.url + "/rest/v1/payments?payment_id=eq." + encodeURIComponent(paymentId), {
      method: "PATCH",
      headers: { ...sb.headers, Prefer: "return=representation" },
      body: JSON.stringify(body)
    });
    const txt = await r.text();
    if (r.status === 409 || (txt && txt.toLowerCase().includes("duplicate"))) {
      return { ok: false, reason: "txid_already_used", status: 409 };
    }
    if (!r.ok) return { ok: false, reason: "update_failed", detail: txt.slice(0, 200), status: r.status };
    const rows = JSON.parse(txt || "[]");
    return { ok: true, row: paymentRowFromDb(rows[0]) };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

async function sbGetPaymentById(env, paymentId) {
  const rows = await sbSelectPayments(env, "payment_id=eq." + encodeURIComponent(paymentId) + "&select=*&limit=1");
  return rows && rows[0] ? paymentRowFromDb(rows[0]) : null;
}

async function sbGetPaymentByOrder(env, orderId) {
  const rows = await sbSelectPayments(env, "order_id=eq." + encodeURIComponent(orderId) + "&select=*&order=created_at.desc&limit=1");
  return rows && rows[0] ? paymentRowFromDb(rows[0]) : null;
}

async function sbGetPaymentByTxid(env, txid) {
  const rows = await sbSelectPayments(env, "txid=eq." + encodeURIComponent(txid) + "&select=*&limit=1");
  return rows && rows[0] ? paymentRowFromDb(rows[0]) : null;
}

/** Atomic claim of TXID: update only if txid is null; unique index blocks cross-row dupes */
async function sbClaimTxid(env, paymentId, txid) {
  const sb = await supabaseHeaders(env);
  if (!sb) return { ok: false, reason: "supabase_not_configured" };
  // Pre-check other row
  const existing = await sbGetPaymentByTxid(env, txid);
  if (existing && existing.payment_id !== paymentId) {
    return { ok: false, reason: "txid_already_used", status: 409 };
  }
  try {
    const r = await fetch(
      sb.url + "/rest/v1/payments?payment_id=eq." + encodeURIComponent(paymentId) + "&or=(txid.is.null,txid.eq." + encodeURIComponent(txid) + ")",
      {
        method: "PATCH",
        headers: { ...sb.headers, Prefer: "return=representation" },
        body: JSON.stringify({
          txid,
          status: "TXID_SUBMITTED",
          submitted_at: new Date().toISOString()
        })
      }
    );
    const txt = await r.text();
    if (r.status === 409 || (txt && /duplicate|unique/i.test(txt))) {
      return { ok: false, reason: "txid_already_used", status: 409 };
    }
    if (!r.ok) return { ok: false, reason: "claim_failed", detail: txt.slice(0, 200), status: r.status };
    const rows = JSON.parse(txt || "[]");
    if (!rows.length) {
      // concurrent claim or wrong id
      const again = await sbGetPaymentByTxid(env, txid);
      if (again && again.payment_id !== paymentId) return { ok: false, reason: "txid_already_used", status: 409 };
      return { ok: false, reason: "claim_empty" };
    }
    return { ok: true, row: paymentRowFromDb(rows[0]) };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
}

// KV only as non-authoritative cache for list UIs
async function cachePayment(env, pay) {
  try {
    const list = (await kvGetJson(env, "payments_v1_cache", [])) || [];
    const i = list.findIndex((p) => p.payment_id === pay.payment_id);
    if (i >= 0) list[i] = pay; else list.push(pay);
    await kvPutJson(env, "payments_v1_cache", list.slice(-500));
  } catch (_) {}
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
    await sbUpsertPayment(env, pay);
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
  await sbUpsertPayment(env, pay);

  // Unique TXID via Supabase as final authority
  const existing = await sbFindPaymentByTxid(env, txid);
  if (existing && existing.order_id && existing.order_id !== orderId) {
    pay.status = "FAILED";
    pay.verification_reason = "txid_already_used";
    await savePayments(env, payments);
    await sbUpsertPayment(env, pay);
    return json({ error: "txid_already_used" }, 409, request);
  }

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
  let pay = await sbGetPaymentById(env, paymentId);
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

  await sbUpdatePayment(env, paymentId, {
    status: "VERIFYING",
    verification_attempts: (pay.verification_attempts || 0) + 1,
    last_verified_at: new Date().toISOString()
  });

  const wallet = paymentWallet(env) || pay.wallet_address;
  const vr = await verifyUsdtTrc20Payment(env, {
    txid: pay.txid,
    expectedAmountUsd: pay.amount,
    expectedTo: wallet
  });

  let status = "FAILED";
  let paid_at = null;
  if (vr.ok) {
    status = "PAID";
    paid_at = new Date().toISOString();
  } else if (vr.reason === "not_confirmed" || vr.reason === "rpc_error") {
    status = "PENDING_RETRY";
  } else if (vr.reason === "amount_too_high_needs_review") {
    status = "MANUAL_REVIEW";
  } else {
    status = "FAILED";
  }

  const upd = await sbUpdatePayment(env, paymentId, {
    status,
    paid_at,
    sender_address: vr.sender,
    block_number: vr.blockNumber,
    amount_raw: vr.amount_raw,
    verification_reason: vr.reason,
    last_verified_at: new Date().toISOString()
  });
  pay = (upd.ok && upd.row) ? upd.row : Object.assign({}, pay, { status, paid_at, verification_reason: vr.reason });
  await cachePayment(env, pay);

  if (status === "PAID") {
    const orders = (await kvGetJson(env, "orders", [])) || [];
    const o = orders.find((x) => x.id === pay.order_id);
    if (o) {
      o.paymentStatus = "PAID";
      o.txid = pay.txid;
      o.paidAt = paid_at;
      await kvPutJson(env, "orders", orders);
    }
  }

  return {
    payment_id: pay.payment_id,
    order_id: pay.order_id,
    status: pay.status,
    amount: pay.amount,
    txid: pay.txid,
    paid_at: pay.paid_at,
    verification_reason: pay.verification_reason,
    blockchain_amount: vr.amount
  };
}

