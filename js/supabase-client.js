const PAROKH_SUPABASE_URL = "https://kklgwyldzpimtzdaleq.supabase.co";
const PAROKH_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbGd3eWxkenBpbXp0emRhbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzY2MzAsImV4cCI6MjEwMDkxMjYzMH0.E9_T6eI8r00P94JB4aGKf6T9-iFRzfCOPkKEInxwHjc";
window.parokhSb = null;

function getParokhSupabase() {
  if (window.parokhSb) return window.parokhSb;
  if (typeof supabase === "undefined" || !supabase.createClient) {
    console.error("Supabase SDK not loaded");
    return null;
  }
  window.parokhSb = supabase.createClient(PAROKH_SUPABASE_URL, PAROKH_SUPABASE_ANON, {
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
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("fetch")) {
    return isFa
      ? "ارتباط با سرور برقرار نشد. فیلتر اینترنت/VPN را بررسی کنید یا بعداً دوباره تلاش کنید."
      : "Cannot reach auth server. Check network/VPN/firewall and try again.";
  }
  if (m.includes("invalid login")) return isFa ? "ایمیل یا رمز اشتباه است" : "Invalid email or password";
  if (m.includes("email not confirmed")) return isFa ? "ابتدا ایمیل را تأیید کنید" : "Confirm your email first";
  if (m.includes("already")) return isFa ? "این ایمیل قبلاً ثبت شده" : "Email already registered";
  if (m.includes("password")) return isFa ? "رمز باید حداقل ۶ کاراکتر باشد" : "Password must be at least 6 characters";
  return err.message || (isFa ? "خطا در احراز هویت" : "Auth error");
}
