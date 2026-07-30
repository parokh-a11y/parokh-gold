const SUPABASE = "https://kklgwyldzpimtzdaleq.supabase.co";
export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": url.origin,
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer",
      "access-control-allow-credentials": "true"
    }});
  }
  const target = SUPABASE + url.pathname.replace(/^\/api/, "") + url.search;
  const headers = new Headers();
  for (const h of ["content-type","authorization","apikey","x-client-info","x-supabase-api-version","prefer","accept"]) {
    const v = req.headers.get(h); if (v) headers.set(h, v);
  }
  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  try {
    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    out.set("access-control-allow-origin", url.origin);
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    return new Response(JSON.stringify({ error: "proxy_failed", message: String(e) }), {
      status: 502, headers: { "content-type": "application/json" }
    });
  }
}
