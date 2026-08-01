// Proxy Supabase through same origin (Iran-friendly)
const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";

export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const target = SUPABASE_URL + path + url.search;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req),
    });
  }

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const key = k.toLowerCase();
    if (["host", "cf-connecting-ip", "cf-ray", "x-forwarded-for"].includes(key)) continue;
    headers.set(k, v);
  }
  headers.set("apikey", headers.get("apikey") || "");

  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(target, { method: req.method, headers, body });
    const outHeaders = new Headers(res.headers);
    const cors = corsHeaders(req);
    cors.forEach((v, k) => outHeaders.set(k, v));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_failed", message: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
    "Access-Control-Allow-Credentials": "true",
  });
}
