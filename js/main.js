
function parokhIsLoggedIn(){
  try {
    if (localStorage.getItem("parokh_session")) return true;
    if (sessionStorage.getItem("parokh_session")) return true;
  } catch(e){}
  return false;
}

(function () {
  "use strict";
  let currentLang = "fa";
  let currentTheme = "dark";
  const body = document.body;
  const html = document.documentElement;

  function detectLanguage() {
    const saved = localStorage.getItem("parokh_lang");
    if (saved === "fa" || saved === "en") return saved;
    const browserLang = (navigator.language || "en").toLowerCase();
    return browserLang.startsWith("fa") ? "fa" : "en";
  }

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("parokh_lang", lang);
    const dict = lang === "fa" ? fa : en;
    body.classList.remove("rtl", "ltr");
    body.classList.add(dict.dir);
    html.setAttribute("lang", dict.lang);
    html.setAttribute("dir", dict.dir);
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-badge]").forEach(function (el) {
      const key = el.getAttribute("data-i18n-badge");
      if (dict[key] !== undefined) el.setAttribute("data-badge", dict[key]);
    });
  }

  function detectTheme() {
    const saved = localStorage.getItem("parokh_theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  }

  function setTheme(theme) {
    currentTheme = theme;
    localStorage.setItem("parokh_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll(".theme-icon").forEach(function (el) {
      el.textContent = theme === "dark" ? "☀️" : "🌙";
    });
  }

  function initMobileMenu() {
    const hamburger = document.querySelector(".hamburger");
    const mobileNav = document.querySelector(".mobile-nav");
    if (!hamburger || !mobileNav) return;
    hamburger.addEventListener("click", function () {
      hamburger.classList.toggle("active");
      mobileNav.classList.toggle("open");
    });
    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        hamburger.classList.remove("active");
        mobileNav.classList.remove("open");
      });
    });
  }

  function initFAQ() {
    document.querySelectorAll(".faq-question").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = btn.parentElement;
        const isOpen = item.classList.contains("open");
        document.querySelectorAll(".faq-item").forEach(function (i) { i.classList.remove("open"); });
        if (!isOpen) item.classList.add("open");
      });
    });
  }

  function initModal() {
    const overlay = document.getElementById("payment-modal");
    if (!overlay) return;
    document.querySelectorAll("[data-open-modal]").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); overlay.classList.add("open"); });
    });
    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () { overlay.classList.remove("open"); });
    });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.classList.remove("open"); });
  }

  function initDisclaimer() {
    const modal = document.getElementById("disclaimer-modal");
    if (!modal) return;
    const check = document.getElementById("risk-check");
    const accept = document.getElementById("risk-accept");
    document.querySelectorAll("[data-open-disclaimer]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        modal.classList.add("open");
        if (check) check.checked = false;
        if (accept) { accept.style.opacity = "0.4"; accept.style.pointerEvents = "none"; }
      });
    });
    document.querySelectorAll("[data-close-disclaimer]").forEach(function (btn) {
      btn.addEventListener("click", function () { modal.classList.remove("open"); });
    });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.classList.remove("open"); });
    if (check && accept) {
      check.addEventListener("change", function () {
        if (check.checked) { accept.style.opacity = "1"; accept.style.pointerEvents = "auto"; }
        else { accept.style.opacity = "0.4"; accept.style.pointerEvents = "none"; }
      });
      accept.addEventListener("click", function () {
        if (!check.checked) return;
        modal.classList.remove("open");
        window.location.href = parokhIsLoggedIn() ? "purchase.html" : "register.html";
      });
    }
  }

  function initLightbox() {
    const lb = document.getElementById("lightbox");
    const lbImg = document.getElementById("lightbox-img");
    if (!lb || !lbImg) return;
    document.querySelectorAll("[data-lightbox]").forEach(function (img) {
      img.addEventListener("click", function () { lbImg.src = img.src; lb.classList.add("open"); });
    });
    lb.addEventListener("click", function () { lb.classList.remove("open"); });
    var closeBtn = document.querySelector(".lightbox-close");
    if (closeBtn) closeBtn.addEventListener("click", function (e) { e.stopPropagation(); lb.classList.remove("open"); });
    document.querySelectorAll("img").forEach(function (img) {
      img.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      img.addEventListener("dragstart", function (e) { e.preventDefault(); });
    });
  }

  function initBackTop() {
    const btn = document.getElementById("back-top");
    if (!btn) return;
    window.addEventListener("scroll", function () {
      if (window.scrollY > 400) btn.classList.add("visible");
      else btn.classList.remove("visible");
    });
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  function bindEvents() {
    document.querySelectorAll("[data-lang-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () { setLanguage(currentLang === "fa" ? "en" : "fa"); });
    });
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () { setTheme(currentTheme === "dark" ? "light" : "dark"); });
    });
  }

  function init() {
    setLanguage(detectLanguage());
    setTheme(detectTheme());
    initMobileMenu();
    initFAQ();
    initModal();
    initDisclaimer();
    initLightbox();
    initBackTop();
    bindEvents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();


/* v1.11 auth nav + idle */
function parokhUpdateAuthNav(){
  var logged = false;
  try { if (localStorage.getItem("parokh_session")) logged = true; } catch(e){}
  var isFa = document.documentElement.lang === "fa" || document.body.classList.contains("rtl");
  document.querySelectorAll('a[href="login.html"], a[href="/login"], a.nav-login-graphic, a.nav-user-link, a.btn-power[data-auth]').forEach(function(a){
    if (logged) {
      // On dashboard: show power (logout). Elsewhere: My Panel
      var onDash = /dashboard\.html/i.test(location.pathname);
      if (onDash) {
        a.href = "#";
        a.className = "btn-power";
        a.setAttribute("data-auth", "logout");
        a.setAttribute("title", isFa ? "خروج" : "Logout");
        a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10"/><path d="M6.1 5.1a8 8 0 1011.8 0"/></svg>';
        a.onclick = function(ev){
          ev.preventDefault();
          try {
            if (window.parokhAuth && parokhAuth.signOut) parokhAuth.signOut();
            else localStorage.removeItem("parokh_session");
          } catch(e){ localStorage.removeItem("parokh_session"); }
          location.href = "index.html";
        };
      } else {
        a.href = "dashboard.html";
        a.classList.add("nav-user-link");
        a.classList.remove("nav-login-graphic");
        a.textContent = isFa ? "پنل من" : "My Panel";
        a.innerHTML = isFa ? "پنل من" : "My Panel";
        a.onclick = null;
      }
    } else {
      a.href = "login.html";
      a.classList.add("nav-login-graphic");
      a.classList.remove("nav-user-link");
      a.setAttribute("title", isFa ? "ورود" : "Login");
      a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
      a.onclick = null;
    }
  });
}
function parokhIdleLogout(minutes, redirectTo){
  var ms = (minutes || 5) * 60 * 1000;
  var t = null;
  function reset(){
    if (t) clearTimeout(t);
    t = setTimeout(function(){
      try {
        localStorage.removeItem("parokh_session");
        sessionStorage.removeItem("parokh_admin_ok");
        sessionStorage.removeItem("parokh_admin_user");
      } catch(e){}
      location.href = redirectTo || "login.html";
    }, ms);
  }
  ["click","mousemove","keydown","touchstart","scroll"].forEach(function(ev){
    document.addEventListener(ev, reset, { passive: true });
  });
  reset();
}
document.addEventListener("DOMContentLoaded", function(){
  try { parokhUpdateAuthNav(); } catch(e){}
});

/* v1.12: disclaimer preserves kind */
document.addEventListener("click", function(e){
  var a = e.target.closest("[data-open-disclaimer]");
  if (!a) return;
  try { sessionStorage.setItem("parokh_order_kind", a.getAttribute("href")||""); } catch(err){}
});
