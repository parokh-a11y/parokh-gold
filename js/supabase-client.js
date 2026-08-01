(function () {
  // Project: kklgwyldzpimztzdaleq  |  Publishable key (browser-safe)
  var ANON_KEY = "sb_publishable_DZgAJmuFp3kxlEZvyyzIiQ_5t-m0gRv";
  var client = null;

  function baseUrl() {
    // Same-origin proxy → Worker forwards to Supabase
    return window.location.origin + "/api";
  }

  window.getParokhSupabase = function () {
    if (client) return client;
    if (typeof supabase === "undefined" || !supabase.createClient) {
      console.error("Supabase SDK not loaded");
      return null;
    }
    client = supabase.createClient(baseUrl(), ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });
    return client;
  };

  window.parokhAuth = {
    async signUp(email, password, name) {
      var sb = getParokhSupabase();
      if (!sb) throw new Error("no_client");
      var res = await sb.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { name: name || "" },
          emailRedirectTo: window.location.origin + "/login.html"
        }
      });
      if (res.error) throw res.error;
      return res.data;
    },
    async signIn(email, password) {
      var sb = getParokhSupabase();
      if (!sb) throw new Error("no_client");
      var res = await sb.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      return res.data;
    },
    async signOut() {
      var sb = getParokhSupabase();
      if (sb) await sb.auth.signOut();
      localStorage.removeItem("parokh_session");
    },
    async session() {
      var sb = getParokhSupabase();
      if (!sb) return null;
      var res = await sb.auth.getSession();
      return (res.data && res.data.session) || null;
    },
    async resetPassword(email) {
      var sb = getParokhSupabase();
      if (!sb) throw new Error("no_client");
      var res = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login.html"
      });
      if (res.error) throw res.error;
      return true;
    },
    async updatePassword(newPassword) {
      var sb = getParokhSupabase();
      if (!sb) throw new Error("no_client");
      var res = await sb.auth.updateUser({ password: newPassword });
      if (res.error) throw res.error;
      return true;
    }
  };
})();
