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
    try {
      client.auth.onAuthStateChange(function (event, session) {
        try {
          window.__parokhUser = (session && session.user) ? session.user : null;
        } catch (e) {}
      });
      client.auth.getSession().then(function (res) {
        try {
          var s = res && res.data && res.data.session;
          window.__parokhUser = (s && s.user) ? s.user : null;
        } catch (e2) {}
      });
    } catch (e3) {}
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
          emailRedirectTo: "https://parokh.ir/login.html"
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
    getUserSync() {
      try { return window.__parokhUser || null; } catch (e) { return null; }
    },
    async signInWithGoogle() {
      var sb = getParokhSupabase();
      if (!sb) throw new Error("Supabase not ready");
      var redirectTo = "https://www.parokh.ir/dashboard.html";
      try {
        if (location && location.hostname && location.hostname.indexOf("parokh.ir") !== -1) {
          redirectTo = location.origin.replace(/\/$/, "") + "/dashboard.html";
        }
      } catch (e0) {}
      return sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo, queryParams: { access_type: "offline", prompt: "select_account" } }
      });
    },
    async signOut() {
      var sb = getParokhSupabase();
      if (sb) await sb.auth.signOut();
      try { window.__parokhUser = null; } catch (e) {}
      try {
        localStorage.removeItem("parokh_session");
        localStorage.removeItem("parokh_users");
      } catch (e2) {}
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
        redirectTo: "https://parokh.ir/reset.html"
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