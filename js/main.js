(function () {
  var LANG_KEY = "parokh_lang";
  var THEME_KEY = "parokh_theme";

  function isFa() {
    return document.body.classList.contains("rtl");
  }
  function dict() {
    return isFa() ? (window.I18N_FA || {}) : (window.I18N_EN || {});
  }
  function applyI18n() {
    var d = dict();
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (d[k] != null) el.textContent = d[k];
    });
    document.documentElement.lang = isFa() ? "fa" : "en";
    document.documentElement.dir = isFa() ? "rtl" : "ltr";
  }
  function setLang(fa) {
    document.body.classList.toggle("rtl", fa);
    document.body.classList.toggle("ltr", !fa);
    localStorage.setItem(LANG_KEY, fa ? "fa" : "en");
    applyI18n();
  }
  function setTheme(light) {
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    localStorage.setItem(THEME_KEY, light ? "light" : "dark");
    document.querySelectorAll(".theme-icon").forEach(function (el) {
      el.textContent = light ? "🌙" : "☀️";
    });
  }
  function initLangTheme() {
    var lang = localStorage.getItem(LANG_KEY);
    if (!lang) lang = (navigator.language || "").toLowerCase().startsWith("fa") ? "fa" : "en";
    setLang(lang === "fa");
    var theme = localStorage.getItem(THEME_KEY) || "dark";
    setTheme(theme === "light");
  }
  async function updateAuthHeader() {
    try {
      if (typeof getParokhSupabase !== "function") return;
      var sb = getParokhSupabase();
      if (!sb) return;
      var session = (await sb.auth.getSession()).data.session;
      document.querySelectorAll("#nav-login-btn, #m-login").forEach(function (el) {
        if (el) el.style.display = session ? "none" : "";
      });
      document.querySelectorAll("#nav-dash-btn, #m-dash").forEach(function (el) {
        if (el) el.style.display = session ? "" : "none";
      });
    } catch (e) {}
  }
  function init() {
    initLangTheme();
    updateAuthHeader();
    document.querySelectorAll("[data-lang-toggle]").forEach(function (b) {
      b.addEventListener("click", function () { setLang(!isFa()); });
    });
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        setTheme(document.documentElement.getAttribute("data-theme") !== "light");
      });
    });
    var ham = document.querySelector(".hamburger");
    var mob = document.querySelector(".mobile-nav");
    if (ham && mob) ham.addEventListener("click", function () { mob.classList.toggle("open"); });
    var back = document.getElementById("back-top");
    if (back) {
      back.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
      window.addEventListener("scroll", function () {
        back.style.opacity = window.scrollY > 400 ? "1" : "0";
      }, { passive: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
