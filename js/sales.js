/* PAROKH GOLD — sales.js v1.32 Option B: short email path, no dashboard required */
(function () {
  var BOT = "https://t.me/ParokhGoldEABot";
  var HUMAN = "https://t.me/Parokhgoldea";
  var prices = { "1m": 39, "6m": 119, "12m": 199, demo: 0 };

  function $(id) { return document.getElementById(id); }
  function isFa() {
    return (document.documentElement.lang || "").toLowerCase().indexOf("fa") === 0 ||
      document.documentElement.getAttribute("dir") === "rtl";
  }

  function setAmount() {
    var plan = ($("o-plan") && $("o-plan").value) || "12m";
    var el = $("order-amount");
    if (el) el.textContent = "$" + (prices[plan] != null ? prices[plan] : 199);
  }

  document.querySelectorAll("[data-plan]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var p = btn.getAttribute("data-plan");
      var sel = $("o-plan");
      if (sel && p) sel.value = p;
      setAmount();
      var order = document.getElementById("order");
      if (order) order.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  var planSel = $("o-plan");
  if (planSel) planSel.addEventListener("change", setAmount);
  setAmount();

  async function postJson(url, body) {
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var text = await r.text();
    var d = null;
    try { d = JSON.parse(text); } catch (e) {
      throw new Error(isFa()
        ? "پاسخ سرور نامعتبر است. از Deploy بودن Worker مطمئن شوید."
        : "Invalid server response. Ensure Worker is deployed.");
    }
    if (!r.ok) throw new Error((d && d.error) || ("HTTP " + r.status));
    return d;
  }

  var demoForm = $("demo-form");
  if (demoForm) {
    demoForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("demo-msg");
      var agree = $("d-agree") && $("d-agree").checked;
      var name = ($("d-name") && $("d-name").value || "").trim();
      var email = ($("d-email") && $("d-email").value || "").trim().toLowerCase();
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!agree) {
        msg.textContent = isFa() ? "پذیرش شرایط دمو الزامی است." : "Please accept demo terms.";
        return;
      }
      if (!name || !email) {
        msg.textContent = isFa() ? "نام و ایمیل لازم است." : "Name and email required.";
        return;
      }
      try {
        await postJson("/api/orders", {
          kind: "demo",
          plan: "demo",
          name: name,
          email: email,
          source: "site-form-demo",
          replyChannel: "email"
        });
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? "درخواست دمو ثبت شد. ادامه از ایمیل یا ربات رسمی."
          : "Demo request submitted. Continue by email or official bot.";
        var tg = $("demo-tg");
        if (tg) {
          tg.hidden = false;
          tg.href = BOT + "?start=demo";
          tg.textContent = isFa() ? "ادامه در ربات" : "Continue in Bot";
        }
      } catch (err) {
        msg.textContent = (err && err.message) || "Error";
      }
    });
  }

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
        msg.textContent = isFa()
          ? "تأیید شرایط فروش الزامی است."
          : "You must acknowledge the sale terms.";
        return;
      }
      if (!name || !email) {
        msg.textContent = isFa() ? "نام و ایمیل لازم است." : "Name and email required.";
        return;
      }
      try {
        var d = await postJson("/api/orders", {
          kind: "full",
          plan: plan,
          name: name,
          email: email,
          refundAcknowledged: true,
          source: "site-form-purchase",
          replyChannel: "email"
        });
        var order = d.order || {};
        if (msg) msg.hidden = true;
        if (result) {
          result.hidden = false;
          if ($("res-order-id")) $("res-order-id").textContent = order.id || "—";
          if ($("res-plan")) $("res-plan").textContent = order.plan || plan;
          if ($("res-amount")) $("res-amount").textContent = "$" + (order.price != null ? order.price : prices[plan]);
          if ($("res-status")) $("res-status").textContent = isFa()
            ? "ثبت شد — ادامه از ایمیل یا ربات"
            : "Submitted — continue by email or bot";
          var tg = $("order-tg");
          if (tg) {
            tg.href = BOT + "?start=buy";
            tg.textContent = isFa() ? "ادامه در ربات فروش" : "Continue in Sales Bot";
          }
        }
        orderForm.hidden = true;
      } catch (err) {
        if (msg) msg.textContent = (err && err.message) || "Error";
      }
    });
  }

  document.querySelectorAll("[data-bot-demo]").forEach(function (a) {
    a.setAttribute("href", BOT + "?start=demo");
  });
  document.querySelectorAll("[data-bot-buy]").forEach(function (a) {
    a.setAttribute("href", BOT + "?start=buy");
  });
  document.querySelectorAll("[data-human-support]").forEach(function (a) {
    a.setAttribute("href", HUMAN);
  });
})();
