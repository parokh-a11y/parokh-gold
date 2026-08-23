
(function () {
  var prices = { "1m": 39, "6m": 119, "12m": 199 };
  var currentOrder = null;

  function $(id) { return document.getElementById(id); }
  function isFa() {
    return document.documentElement.lang === "fa" || document.body.classList.contains("rtl");
  }

  function setAmount(plan) {
    var p = prices[plan] || 199;
    var el = $("pay-amount");
    if (el && currentOrder) el.textContent = "$" + p;
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

  // Demo
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
        id: demoId, name: name, email: email, country: country, mt5: mt5,
        kind: "demo", plan: "demo", status: "requested", at: new Date().toISOString()
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
      var raw = "درخواست دمو PAROKH GOLD EA\nID: " + demoId + "\nنام: " + name + "\nایمیل: " + email + "\nکشور: " + country + "\nMT5: " + mt5;
      if (msg) {
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? ("درخواست ثبت شد (" + demoId + "). در سیستم پشتیبانی پیگیری می‌شود.")
          : ("Request submitted (" + demoId + "). Tracked in support system.");
      }
      setTimeout(function () {
        window.open("https://t.me/Parokhgoldea?text=" + encodeURIComponent(raw), "_blank");
      }, 400);
    });
  }

  function showPayment(order) {
    currentOrder = order;
    var idle = $("pay-idle");
    var ready = $("pay-ready");
    if (idle) idle.hidden = true;
    if (ready) ready.hidden = false;
    if ($("pay-oid")) $("pay-oid").textContent = order.id;
    if ($("pay-amount")) $("pay-amount").textContent = "$" + (order.price || "—");
    // Address comes from backend later — never show fake wallet
    var addr = $("pay-address");
    if (addr) {
      if (order.paymentAddress) {
        addr.textContent = order.paymentAddress;
        if ($("copy-address")) $("copy-address").hidden = false;
      } else {
        addr.textContent = isFa()
          ? "آدرس یکتای این سفارش پس از اتصال درگاه نمایش داده می‌شود"
          : "Unique address for this order will appear when payment gateway is connected";
        if ($("copy-address")) $("copy-address").hidden = true;
      }
    }
    var st = $("pay-status-2");
    if (st) st.textContent = "WAITING_FOR_PAYMENT";
  }

  var form = $("sales-order-form");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("order-msg");
      var name = ($("o-name").value || "").trim();
      var email = ($("o-email").value || "").trim().toLowerCase();
      var broker = ($("o-broker").value || "").trim();
      var account = ($("o-account").value || "").trim();
      var plan = ($("o-plan").value || "12m");
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

      var orderId = "PG-" + Date.now().toString(36).toUpperCase();
      var order = {
        id: orderId,
        name: name,
        email: email,
        broker: broker,
        account: account,
        kind: "full",
        plan: plan,
        price: price,
        currency: "USDT",
        network: "TRC20",
        paymentAddress: null,
        paymentStatus: "WAITING_FOR_PAYMENT",
        txid: null,
        ex5Status: "PENDING",
        licenseStatus: "PENDING",
        deliveryStatus: "PENDING",
        createdAt: new Date().toISOString()
      };

      try {
        var res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order)
        });
        var data = await res.json();
        if (data && data.order) {
          order = Object.assign(order, data.order);
          if (data.order.id) order.id = data.order.id;
          if (data.order.paymentAddress) order.paymentAddress = data.order.paymentAddress;
        }
      } catch (err) {}

      /* Orders source of truth: Cloudflare Worker + KV (not localStorage) */

      showPayment(order);

      if (msg) {
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? ("سفارش ایجاد شد: " + order.id + " — به بخش پرداخت مراجعه کنید.")
          : ("Order created: " + order.id + " — see payment panel.");
      }

      var panel = document.getElementById("payment-panel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

      // Notify manager via Telegram (order created — not payment confirmed)
      var raw =
        "سفارش جدید PAROKH GOLD EA\n" +
        "Order ID: " + order.id + "\n" +
        "پلن: " + plan + " / $" + price + "\n" +
        "نام: " + name + "\n" +
        "ایمیل: " + email + "\n" +
        "بروکر: " + broker + "\n" +
        "حساب: " + account + "\n" +
        "وضعیت: WAITING_FOR_PAYMENT";
      setTimeout(function () {
        window.open("https://t.me/Parokhgoldea?text=" + encodeURIComponent(raw), "_blank");
      }, 600);
    });
  }

  var copyBtn = $("copy-address");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var addr = ($("pay-address") && $("pay-address").textContent) || "";
      if (!addr || addr.indexOf("TBD") >= 0 || addr.length < 20) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(function () {
          copyBtn.textContent = isFa() ? "کپی شد" : "Copied";
        });
      }
    });
  }

  var txBtn = $("send-txid");
  if (txBtn) {
    txBtn.addEventListener("click", function () {
      var tx = ($("o-txid") && $("o-txid").value || "").trim();
      if (!tx || !currentOrder) return;
      currentOrder.txid = tx;
      currentOrder.paymentStatus = "PAYMENT_REVIEW";
      var st = $("pay-status-2");
      if (st) st.textContent = "PAYMENT_REVIEW";
      var raw = "TXID بررسی دستی\nOrder: " + currentOrder.id + "\nTXID: " + tx + "\nEmail: " + (currentOrder.email || "");
      window.open("https://t.me/Parokhgoldea?text=" + encodeURIComponent(raw), "_blank");
    });
  }
})();
