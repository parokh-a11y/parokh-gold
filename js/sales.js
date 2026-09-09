/* PAROKH GOLD v2.0 — simple guest purchase + TXID */
(function () {
  var BOT = "https://t.me/ParokhGoldEABot";
  var HUMAN = "https://t.me/Parokhgoldea";
  var prices = { "1m": 39, "6m": 119, "12m": 199, demo: 0 };
  var currentOrder = null;

  function $(id) { return document.getElementById(id); }
  function isFa() {
    return (document.documentElement.lang || "").indexOf("fa") === 0 ||
      document.documentElement.getAttribute("dir") === "rtl";
  }

  function setAmount() {
    var plan = ($("o-plan") && $("o-plan").value) || "6m";
    if ($("order-amount")) $("order-amount").textContent = "$" + (prices[plan] || 119);
  }

  document.querySelectorAll("[data-plan]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var p = btn.getAttribute("data-plan");
      if ($("o-plan") && p) $("o-plan").value = p;
      setAmount();
      var el = document.getElementById("order");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    });
  });
  if ($("o-plan")) $("o-plan").addEventListener("change", setAmount);
  setAmount();

  async function postJson(url, body) {
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var text = await r.text();
    var d;
    try { d = JSON.parse(text); } catch (e) {
      throw new Error(isFa()
        ? "پاسخ سرور نامعتبر است (Worker را Deploy کنید)."
        : "Invalid server response (deploy Worker).");
    }
    if (!r.ok) throw new Error((d && d.error) || ("HTTP " + r.status));
    return d;
  }

  function showPayment(order, payment) {
    currentOrder = order;
    var panel = $("pay-panel");
    if (!panel) return;
    panel.hidden = false;
    if ($("pay-order-id")) $("pay-order-id").textContent = order.id || "—";
    var amt = (payment && payment.amount != null) ? payment.amount : order.price;
    if ($("pay-amount")) $("pay-amount").textContent = String(amt);
    var wallet = (payment && payment.wallet) || "";
    if ($("pay-wallet")) $("pay-wallet").textContent = wallet || (isFa() ? "ولت هنوز تنظیم نشده" : "Wallet not configured");
    var qr = $("pay-qr");
    if (qr && wallet && window.ParokhQR) {
      ParokhQR.render(qr, wallet, 180);
    } else if (qr && wallet && typeof QRCode !== "undefined") {
      qr.innerHTML = "";
      try { new QRCode(qr, { text: wallet, width: 180, height: 180 }); } catch (e) {}
    }
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if ($("pay-copy")) {
    $("pay-copy").addEventListener("click", function () {
      var w = ($("pay-wallet") && $("pay-wallet").textContent) || "";
      if (!w || w.indexOf(" ") >= 0) return;
      if (navigator.clipboard) navigator.clipboard.writeText(w);
    });
  }

  if ($("pay-txid-btn")) {
    $("pay-txid-btn").addEventListener("click", async function () {
      var msg = $("pay-msg");
      var txid = ($("pay-txid") && $("pay-txid").value || "").trim();
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!currentOrder || !currentOrder.id) {
        msg.textContent = isFa() ? "ابتدا سفارش ثبت کنید." : "Submit order first.";
        return;
      }
      if (txid.length < 20) {
        msg.textContent = isFa() ? "TXID معتبر نیست." : "Invalid TXID.";
        return;
      }
      try {
        await postJson("/api/payment/txid", {
          orderId: currentOrder.id,
          txid: txid,
          email: currentOrder.email
        });
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? "TXID ثبت شد. پس از بررسی، ادامه از ایمیل انجام می‌شود."
          : "TXID submitted. We will continue by email after review.";
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
      var plan = ($("o-plan") && $("o-plan").value) || "6m";
      var name = ($("o-name") && $("o-name").value || "").trim();
      var email = ($("o-email") && $("o-email").value || "").trim().toLowerCase();
      var refund = $("o-refund") && $("o-refund").checked;
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!refund) {
        msg.textContent = isFa() ? "پذیرش شرایط لازم است." : "Please accept terms.";
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
          source: "site-form",
          replyChannel: "email"
        });
        var order = d.order || {};
        order.email = order.email || email;
        if (msg) {
          msg.style.color = "#4ade80";
          msg.textContent = isFa() ? "سفارش ثبت شد." : "Order submitted.";
        }
        showPayment(order, d.payment);
        orderForm.querySelectorAll("input,select,button").forEach(function (el) {
          if (el.id !== "pay-copy") el.disabled = true;
        });
      } catch (err) {
        msg.textContent = (err && err.message) || "Error";
      }
    });
  }

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
        msg.textContent = isFa() ? "پذیرش شرایط دمو لازم است." : "Accept demo terms.";
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
        msg.textContent = isFa() ? "درخواست دمو ثبت شد." : "Demo request submitted.";
        var tg = $("demo-tg");
        if (tg) { tg.hidden = false; tg.href = BOT + "?start=demo"; }
      } catch (err) {
        msg.textContent = (err && err.message) || "Error";
      }
    });
  }

  var openChat = $("open-chat-btn");
  if (openChat) {
    openChat.addEventListener("click", function () {
      if (window.ParokhChat && window.ParokhChat.open) window.ParokhChat.open("buy");
    });
  }
})();
