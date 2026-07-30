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
        window.location.href = "register.html";
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

  
  async function updateAuthHeader() {
    try {
      if (typeof getParokhSupabase !== "function") return;
      const sb = getParokhSupabase();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      document.querySelectorAll("#nav-login-btn, #m-login").forEach(function(el){ if(el) el.style.display = session ? "none" : ""; });
      document.querySelectorAll("#nav-dash-btn, #m-dash").forEach(function(el){ if(el) el.style.display = session ? "" : "none"; });
    } catch (e) {}
  }

  function init() {
    updateAuthHeader();
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
