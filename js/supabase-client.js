const PAROKH_SUPABASE_URL = "https://kklgwyldzpimtzdaleq.supabase.co";
const PAROKH_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrbGd3eWxkenBpbXp0emRhbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzY2MzAsImV4cCI6MjEwMDkxMjYzMH0.E9_T6eI8r00P94JB4aGKf6T9-iFRzfCOPkKEInxwHjc";
window.parokhSb = null;
function getParokhSupabase() {
  if (window.parokhSb) return window.parokhSb;
  if (typeof supabase === "undefined" || !supabase.createClient) {
    console.error("Supabase SDK not loaded");
    return null;
  }
  window.parokhSb = supabase.createClient(PAROKH_SUPABASE_URL, PAROKH_SUPABASE_ANON);
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
