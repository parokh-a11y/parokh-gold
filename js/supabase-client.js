const PAROKH_SUPABASE_DIRECT = "https://kklgwyldzpimtzdaleq.supabase.co";
const PAROKH_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbGd3eWxkenBpbXp0emRhbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzY2MzAsImV4cCI6MjEwMDkxMjYzMH0.E9_T6eI8r00P94JB4aGKf6T9-iFRzfCOPkKEInxwHjc";

window.parokhSb = null;

function parokhAuthBaseUrl() {
  // On deployed site (http/https host): use same-origin /api proxy
  try {
    if (location.protocol === "http:" || location.protocol === "https:") {
      if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        return location.origin + "/api";
      }
      // local server: try proxy first path; fallback direct if needed
      return location.origin + "/api";
    }
  } catch (e) {}
  return PAROKH_SUPABASE_DIRECT;
}

function getParokhSupabase() {
  if (window.parokhSb) return window.parokhSb;
  if (typeof supabase === "undefined" || !supabase.createClient) {
    console.error("Supabase SDK not loaded");
    return null;
  }
  const base = parokhAuthBaseUrl();
  window.parokhSb = supabase.createClient(base, PAROKH_SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return window.parokhSb;
}

async function parokhRequireAuth() {
  const sb = getParokhSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

function parokhAuthErrorMessage(err, isFa) {
  if (!err) return isFa ? "خطای ناشناخته" : "Unknown error";
  const m = (err.message || String(err)).toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("fetch") || m.includes("proxy_upstream")) {
    return isFa
      ? "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."
      : "Cannot reach auth server. Check your connection and try again.";
  }
  if (m.includes("invalid login")) return isFa ? "ایمیل یا رمز اشتباه است" : "Invalid email or password";
  if (m.includes("email not confirmed")) return isFa ? "ابتدا ایمیل را تأیید کنید" : "Confirm your email first";
  if (m.includes("already")) return isFa ? "این ایمیل قبلاً ثبت شده" : "Email already registered";
  if (m.includes("password")) return isFa ? "رمز باید حداقل ۶ کاراکتر باشد" : "Password must be at least 6 characters";
  return err.message || (isFa ? "خطا در احراز هویت" : "Auth error");
}

/** Password show/hide eye toggles */
function parokhBindPasswordToggles(root) {
  (root || document).querySelectorAll("input[type=password][data-eye], input[type=password].with-eye").forEach(function (input) {
    if (input.dataset.eyeBound) return;
    input.dataset.eyeBound = "1";
    var wrap = document.createElement("div");
    wrap.className = "pass-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pass-eye";
    btn.setAttribute("aria-label", "Show password");
    btn.innerHTML = "👁";
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show ? "🙈" : "👁";
    });
    wrap.appendChild(btn);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  parokhBindPasswordToggles(document);
});
