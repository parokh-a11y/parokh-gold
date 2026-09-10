/* PAROKH GOLD v2.0.4 — shared demo/buy + account after pay */
(function () {
  var prices = { "1m": 39, "6m": 119, "12m": 199 };
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
        ? "پاسخ سرور نامعتبر است. اگر تازه به‌روزرسانی کرده‌اید، Worker را دوباره Deploy کنید."
        : "Invalid server response. Redeploy the Worker if you just updated.");
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
    if ($("pay-wallet")) {
      $("pay-wallet").textContent = wallet || (isFa() ? "آدرس کیف‌پول هنوز تنظیم نشده است." : "Wallet is not configured yet.");
    }
    var qr = $("pay-qr");
    if (qr && wallet) {
      qr.innerHTML = "";
      if (window.ParokhQR) {
        try { ParokhQR.render(qr, wallet, 180); } catch (e) {}
      } else if (typeof QRCode !== "undefined") {
        try { new QRCode(qr, { text: wallet, width: 180, height: 180 }); } catch (e) {}
      }
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
      var broker = ($("pay-broker") && $("pay-broker").value || "").trim();
      var account = ($("pay-account") && $("pay-account").value || "").trim();
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!currentOrder || !currentOrder.id) {
        msg.textContent = isFa() ? "ابتدا سفارش را ثبت کنید." : "Submit the order first.";
        return;
      }
      if (!broker || !account) {
        msg.textContent = isFa() ? "نام بروکر و شماره حساب MT5 لازم است." : "Broker name and MT5 account are required.";
        return;
      }
      if (txid.length < 20) {
        msg.textContent = isFa() ? "TXID معتبر به‌نظر نمی‌رسد." : "TXID does not look valid.";
        return;
      }
      try {
        await postJson("/api/payment/txid", {
          orderId: currentOrder.id,
          txid: txid,
          email: currentOrder.email,
          broker: broker,
          account: account
        });
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? "ثبت شد. پس از بررسی پرداخت، از همان ایمیل برای تحویل EX5 با شما هماهنگ می‌کنیم."
          : "Saved. After payment review we will continue by the same email for EX5 delivery.";
      } catch (err) {
        msg.textContent = (err && err.message) || "Error";
      }
    });
  }

  function readForm() {
    return {
      plan: ($("o-plan") && $("o-plan").value) || "6m",
      name: ($("o-name") && $("o-name").value || "").trim(),
      email: ($("o-email") && $("o-email").value || "").trim().toLowerCase(),
      refund: $("o-refund") && $("o-refund").checked
    };
  }

  async function submitKind(kind) {
    var msg = $("order-msg");
    var f = readForm();
    if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
    if (!f.name || !f.email) {
      msg.textContent = isFa() ? "نام و ایمیل لازم است." : "Name and email are required.";
      return;
    }
    if (!f.refund) {
      msg.textContent = isFa() ? "لطفاً شرایط را بپذیرید." : "Please accept the terms.";
      return;
    }
    try {
      var d = await postJson("/api/orders", {
        kind: kind,
        plan: kind === "demo" ? "demo" : f.plan,
        name: f.name,
        email: f.email,
        refundAcknowledged: true,
        source: "website",
        replyChannel: "email"
      });
      var order = d.order || {};
      order.email = order.email || f.email;
      if (kind === "demo") {
        msg.style.color = "#4ade80";
        msg.textContent = isFa()
          ? ("درخواست دمو ثبت شد. کد: " + (order.id || "") + " — پیگیری از ایمیل شما انجام می‌شود.")
          : ("Demo request saved. ID: " + (order.id || "") + " — We will follow up by your email.");
        return;
      }
      msg.style.color = "#4ade80";
      msg.textContent = isFa() ? "سفارش ثبت شد. جزئیات پرداخت در ادامه است." : "Order created. Payment details follow.";
      showPayment(order, d.payment);
    } catch (err) {
      msg.textContent = (err && err.message) || "Error";
    }
  }

  if ($("btn-demo")) $("btn-demo").addEventListener("click", function () { submitKind("demo"); });
  if ($("btn-buy")) $("btn-buy").addEventListener("click", function () { submitKind("full"); });

  var openChat = $("open-chat-btn");
  if (openChat) {
    openChat.addEventListener("click", function () {
      if (window.ParokhChat && window.ParokhChat.open) window.ParokhChat.open("buy");
    });
  }
})();
