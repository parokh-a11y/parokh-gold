
(function () {
  var WALLET = "TBD_WALLET_ADDRESS_TRC20";
  var prices = { "1m": 39, "6m": 119, "12m": 199 };

  function $(id) { return document.getElementById(id); }
  function isFa() {
    return document.documentElement.lang === "fa" || document.body.classList.contains("rtl");
  }

  function setAmount(plan) {
    var p = prices[plan] || 199;
    var el = $("pay-amount");
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
    setAmount(planSel.value || "12m");
  }

  var copyBtn = $("copy-address");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var addr = ($("pay-address") && $("pay-address").textContent) || WALLET;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(function () {
          copyBtn.textContent = isFa() ? "کپی شد" : "Copied";
          setTimeout(function () {
            copyBtn.textContent = isFa() ? "کپی آدرس" : "Copy address";
          }, 1500);
        });
      }
    });
  }

  (async function () {
    var email = "";
    try { email = localStorage.getItem("parokh_session") || ""; } catch (e) {}
    try {
      if (window.parokhAuth && parokhAuth.session) {
        var s = await parokhAuth.session();
        if (s && s.user && s.user.email) email = s.user.email;
      }
    } catch (e) {}
    ["o-email", "d-email"].forEach(function (id) {
      var em = $(id);
      if (em && email) em.value = email;
    });
  })();

  // Demo form
  var demoForm = $("demo-form");
  if (demoForm) {
    demoForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("demo-msg");
      var name = ($("d-name").value || "").trim();
      var email = ($("d-email").value || "").trim().toLowerCase();
      var country = ($("d-country").value || "").trim();
      var mt5 = ($("d-mt5").value || "yes");
      var agree = $("d-agree") && $("d-agree").checked;
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!agree) {
        if (msg) msg.textContent = isFa() ? "پذیرش شرایط دمو الزامی است." : "Please accept demo terms.";
        return;
      }
      if (!name || !email || !country) {
        if (msg) msg.textContent = isFa() ? "همه فیلدها را پر کنید." : "Fill all fields.";
        return;
      }
      var demoId = "DM-" + Date.now().toString(36).toUpperCase();
      var payload = {
        id: demoId,
        name: name,
        email: email,
        country: country,
        mt5: mt5,
        kind: "demo",
        plan: "demo",
        status: "requested",
        at: new Date().toISOString()
      };
      try {
        await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (err) {}
      try {
        var local = JSON.parse(localStorage.getItem("parokh_demo_requests") || "[]");
        local.push(payload);
        localStorage.setItem("parokh_demo_requests", JSON.stringify(local));
      } catch (x) {}
      var raw =
        "درخواست دمو PAROKH GOLD EA\n" +
        "ID: " + demoId + "\n" +
        "نام: " + name + "\n" +
        "ایمیل: " + email + "\n" +
        "کشور: " + country + "\n" +
        "MT5: " + mt5;
      if (msg) {
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? ("درخواست دمو ثبت شد (" + demoId + "). پشتیبانی به‌زودی تماس می‌گیرد.")
          : ("Demo request submitted (" + demoId + "). Support will follow up.");
      }
      setTimeout(function () {
        window.open("https://t.me/Parokhea?text=" + encodeURIComponent(raw), "_blank");
      }, 400);
    });
  }

  var form = $("sales-order-form");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = $("order-msg");
    var name = ($("o-name").value || "").trim();
    var email = ($("o-email").value || "").trim().toLowerCase();
    var broker = ($("o-broker").value || "").trim();
    var account = ($("o-account").value || "").trim();
    var plan = ($("o-plan").value || "12m");
    var txid = ($("o-txid").value || "").trim();
    var agree = $("o-agree") && $("o-agree").checked;
    var price = prices[plan] || 199;

    if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
    if (!agree) {
      if (msg) msg.textContent = isFa() ? "پذیرش قوانین الزامی است." : "You must accept the terms.";
      return;
    }
    if (!name || !email || !broker || !account) {
      if (msg) msg.textContent = isFa() ? "همه فیلدهای ضروری را پر کنید." : "Please fill all required fields.";
      return;
    }

    var order = null;
    try {
      var res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name, email: email, broker: broker, account: account,
          kind: "full", plan: plan, price: price, txid: txid, network: "TRC20"
        })
      });
      var data = await res.json();
      if (data && data.order) order = data.order;
    } catch (err) {}

    try {
      var orders = JSON.parse(localStorage.getItem("parokh_orders") || "[]");
      orders.push(order || {
        name: name, email: email, broker: broker, account: account,
        plan: plan, price: price, txid: txid, at: new Date().toISOString()
      });
      localStorage.setItem("parokh_orders", JSON.stringify(orders));
    } catch (x) {}

    var id = (order && order.id) ? order.id : ("PG-" + Date.now().toString(36).toUpperCase());
    var raw =
      "سفارش جدید PAROKH GOLD EA\n" +
      "شماره: " + id + "\n" +
      "پلن: " + plan + " / $" + price + "\n" +
      "نام: " + name + "\n" +
      "ایمیل: " + email + "\n" +
      "بروکر: " + broker + "\n" +
      "حساب: " + account + "\n" +
      "شبکه: TRC20\n" +
      "TXID: " + (txid || "—");
    var text = encodeURIComponent(raw);

    if (msg) {
      msg.style.color = "#4ade80";
      msg.textContent = isFa()
        ? ("سفارش ثبت شد (" + id + "). در حال باز کردن تلگرام...")
        : ("Order submitted (" + id + "). Opening Telegram...");
    }
    var st = $("pay-status");
    if (st) st.textContent = isFa() ? "وضعیت: سفارش ثبت شد — در انتظار تأیید" : "Status: order submitted — awaiting verification";

    setTimeout(function () {
      window.open("https://t.me/Parokhea?text=" + text, "_blank");
    }, 500);
  });
})();
