
(function () {
  var prices = { "1m": 39, "6m": 119, "12m": 199 };
  var SUPPORT_TG = "https://t.me/Parokhgoldea";

  function $(id) { return document.getElementById(id); }
  function isFa() {
    return document.documentElement.lang === "fa" || document.body.classList.contains("rtl");
  }

  function setAmount(plan) {
    var p = prices[plan] || 199;
    var el = $("order-amount");
    if (el) el.textContent = "$" + p;
    var sel = $("o-plan");
    if (sel) sel.value = plan;
    document.querySelectorAll(".plan-card").forEach(function (c) {
      c.classList.toggle("featured", c.getAttribute("data-plan") === plan);
    });
  }

  document.querySelectorAll(".plan-select").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var plan = btn.getAttribute("data-plan") || "12m";
      setAmount(plan);
      var order = document.getElementById("order");
      if (order) order.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  var planSel = $("o-plan");
  if (planSel) {
    planSel.addEventListener("change", function () { setAmount(planSel.value); });
  }
  setAmount((planSel && planSel.value) || "12m");

  (async function () {
    var email = "";
    try {
      if (window.parokhAuth && parokhAuth.session) {
        var s = await parokhAuth.session();
        if (s && s.user && s.user.email) email = s.user.email;
      }
    } catch (e) {}
    ["o-email", "d-email"].forEach(function (id) {
      var em = $(id);
      if (em && email) {
        em.value = email;
        em.readOnly = true;
      }
    });
  })();

  async function authHeaders() {
    var h = { "Content-Type": "application/json" };
    try {
      if (window.parokhAuth && parokhAuth.session) {
        var s = await parokhAuth.session();
        if (s && s.access_token) h["Authorization"] = "Bearer " + s.access_token;
      }
    } catch (e) {}
    return h;
  }

  // Demo form
  var demoForm = $("demo-form");
  if (demoForm) {
    demoForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("demo-msg");
      var name = ($("d-name") && $("d-name").value || "").trim();
      var email = ($("d-email") && $("d-email").value || "").trim().toLowerCase();
      var agree = $("d-agree") && $("d-agree").checked;
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!agree) {
        if (msg) msg.textContent = isFa() ? "پذیرش شرایط دمو الزامی است." : "Please accept demo terms.";
        return;
      }
      if (!name || !email) {
        if (msg) msg.textContent = isFa() ? "نام و ایمیل لازم است." : "Name and email required.";
        return;
      }
      try {
        var r = await fetch("/api/orders", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ kind: "demo", plan: "demo", name: name, email: email })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(d.error || "error");
        if (msg) {
          msg.style.color = "#4ade80";
          msg.textContent = isFa()
            ? "درخواست دمو ثبت شد. از طریق تلگرام با پشتیبانی در ارتباط باشید."
            : "Demo request submitted. Contact support on Telegram.";
        }
        var tg = $("demo-tg");
        if (tg) {
          tg.hidden = false;
          tg.href = SUPPORT_TG + "?text=" + encodeURIComponent("PAROKH GOLD Demo request · " + email);
        }
      } catch (err) {
        if (msg) msg.textContent = (err && err.message) || "Error";
      }
    });
  }

  // Purchase request (no wallet / no TXID on site)
  var orderForm = $("order-form");
  if (orderForm) {
    orderForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("order-msg");
      var result = $("order-result");
      var plan = ($("o-plan") && $("o-plan").value) || "12m";
      var name = ($("o-name") && $("o-name").value || "").trim();
      var email = ($("o-email") && $("o-email").value || "").trim().toLowerCase();
      var refund = $("o-refund") && $("o-refund").checked;
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!refund) {
        if (msg) msg.textContent = isFa()
          ? "تأیید شرایط نهایی بودن فروش الزامی است."
          : "You must acknowledge the final sale / refund terms.";
        return;
      }
      if (!name || !email) {
        if (msg) msg.textContent = isFa() ? "نام و ایمیل لازم است." : "Name and email required.";
        return;
      }
      try {
        var r = await fetch("/api/orders", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            kind: "full",
            plan: plan,
            name: name,
            email: email,
            refundAcknowledged: true
          })
        });
        var d = await r.json();
        if (!r.ok) {
          if (d.error === "auth_required") {
            location.href = "login.html?next=purchase.html";
            return;
          }
          throw new Error(d.error || "error");
        }
        var order = d.order || {};
        if (msg) msg.hidden = true;
        if (result) {
          result.hidden = false;
          var idEl = $("res-order-id");
          var planEl = $("res-plan");
          var amtEl = $("res-amount");
          var stEl = $("res-status");
          if (idEl) idEl.textContent = order.id || "—";
          if (planEl) planEl.textContent = order.plan || plan;
          if (amtEl) amtEl.textContent = "$" + (order.price != null ? order.price : prices[plan]);
          if (stEl) stEl.textContent = order.paymentStatus || "PAYMENT_PENDING";
          var tg = $("order-tg");
          if (tg) {
            var text = "PAROKH GOLD Purchase Request\nOrder: " + (order.id || "") +
              "\nPlan: " + (order.plan || plan) +
              "\nAmount: $" + (order.price != null ? order.price : prices[plan]) +
              "\nEmail: " + email;
            tg.href = SUPPORT_TG + "?text=" + encodeURIComponent(text);
          }
        }
        orderForm.hidden = true;
      } catch (err) {
        if (msg) msg.textContent = (err && err.message) || "Error";
      }
    });
  }
})();
