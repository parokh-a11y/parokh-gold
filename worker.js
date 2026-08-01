const SUPABASE_URL = "https://kklgwyldzpimztzdaleq.supabase.co";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      return proxySupabase(request, url);
    }

    // static assets via ASSETS binding (Pages) or passthrough
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

async function proxySupabase(request, url) {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const target = SUPABASE_URL + path + url.search;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(request) });
  }

  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const key = k.toLowerCase();
    if (["host", "cf-connecting-ip", "cf-ray"].includes(key)) continue;
    headers.set(k, v);
  }

  const init = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    cors(request).forEach((v, k) => out.set(k, v));
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_failed", message: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(cors(request)) },
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
