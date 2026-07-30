const PAROKH_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbGd3eWxkenBpbXp0emRhbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzY2MzAsImV4cCI6MjEwMDkxMjYzMH0.E9_T6eI8r00P94JB4aGKf6T9-iFRzfCOPkKEInxwHjc";
window.parokhSb = null;

function parokhAuthBaseUrl() {
  // Same-origin proxy — required for users who cannot reach supabase.co
  if (typeof location !== "undefined" && (location.protocol === "http:" || location.protocol === "https:")) {
    return location.origin + "/api";
  }
  return "https://kklgwyldzpimtzdaleq.supabase.co";
}

function getParokhSupabase() {
  if (window.parokhSb) return window.parokhSb;
  if (typeof supabase === "undefined" || !supabase.createClient) {
    console.error("Supabase SDK not loaded");
    return null;
  }
  window.parokhSb = supabase.createClient(parokhAuthBaseUrl(), PAROKH_SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return window.parokhSb;
}

async function parokhRequireAuth() {
  const sb = getParokhSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = "login.html"; return null; }
  return session;
}

function parokhAuthErrorMessage(err, isFa) {
  if (!err) return isFa ? "خطای ناشناخته" : "Unknown error";
  const m = (err.message || String(err)).toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("fetch") || m.includes("proxy"))
    return isFa ? "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید." : "Cannot reach auth server. Check your connection.";
  if (m.includes("invalid login")) return isFa ? "ایمیل یا رمز اشتباه است" : "Invalid email or password";
  if (m.includes("email not confirmed")) return isFa ? "ابتدا ایمیل را تأیید کنید" : "Confirm your email first";
  if (m.includes("already")) return isFa ? "این ایمیل قبلاً ثبت شده" : "Email already registered";
  if (m.includes("password")) return isFa ? "رمز عبور معتبر نیست (حداقل ۶ کاراکتر)" : "Invalid password (min 6 characters)";
  return err.message || (isFa ? "خطا در احراز هویت" : "Auth error");
}

function parokhBindPasswordToggles(root) {
  (root || document).querySelectorAll("input[type=password].with-eye").forEach(function (input) {
    if (input.dataset.eyeBound) return;
    input.dataset.eyeBound = "1";
    var wrap = document.createElement("div");
    wrap.className = "pass-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pass-eye";
    btn.setAttribute("aria-label", "Toggle password");
    btn.textContent = "👁";
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁";
    });
    wrap.appendChild(btn);
  });
}
document.addEventListener("DOMContentLoaded", function () { parokhBindPasswordToggles(document); });
