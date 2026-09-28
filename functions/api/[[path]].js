const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";

export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/api/, "") || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const target = SUPABASE_URL + path + url.search;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const low = k.toLowerCase();
    if (["host", "cf-connecting-ip", "cf-ray"].includes(low)) continue;
    headers.set(k, v);
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    cors(req).forEach((v, k) => out.set(k, v));
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_failed", message: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(cors(req)) },
    });
  }
}

function cors(req) {
  const origin = req.headers.get("Origin") || "*";
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
  });
}
