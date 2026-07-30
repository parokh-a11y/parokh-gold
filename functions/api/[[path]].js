const SUPABASE = "https://kklgwyldzpimtzdaleq.supabase.co";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(url.origin)
    });
  }

  // /api/auth/v1/signup -> /auth/v1/signup
  const targetPath = url.pathname.replace(/^\/api/, "") + url.search;
  const targetUrl = SUPABASE + targetPath;

  const headers = new Headers();
  for (const h of ["content-type", "authorization", "apikey", "x-client-info", "x-supabase-api-version", "prefer", "accept"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const res = await fetch(targetUrl, init);
    const out = new Headers(res.headers);
    const cors = corsHeaders(url.origin);
    cors.forEach((v, k) => out.set(k, v));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_failed", message: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json", ...Object.fromEntries(corsHeaders(url.origin)) }
    });
  }
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-max-age": "86400"
  };
}
