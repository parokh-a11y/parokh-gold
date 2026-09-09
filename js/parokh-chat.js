/* PAROKH GOLD v2.0.2 — site sales bot (Telegram-like menu) */
(function () {
  var BOT = "https://t.me/ParokhGoldEABot";
  var HUMAN = "https://t.me/Parokhgoldea";
  var PRICES = { "1m": 39, "6m": 119, "12m": 199 };
  var state = resetState();

  function resetState() {
    return { step: "home", intent: null, plan: "6m", name: "", email: "", order: null, wallet: "" };
  }
  function isFa() {
    return (document.documentElement.lang || "").indexOf("fa") === 0 ||
      document.documentElement.getAttribute("dir") === "rtl";
  }
  function t(fa, en) { return isFa() ? fa : en; }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function ensureUi() {
    if (document.getElementById("pg-chat-root")) return;
    var css = document.createElement("style");
    css.textContent = [
      "#pg-chat-root{position:fixed;z-index:9999;font-family:inherit}",
      "#pg-chat-bubble{position:fixed;bottom:88px;inset-inline-end:18px;width:58px;height:58px;border-radius:50%;",
      "background:linear-gradient(135deg,#d4af37,#f0d78c);color:#111;border:none;box-shadow:0 8px 24px rgba(212,175,55,.4);",
      "cursor:pointer;font-weight:800;font-size:12px;letter-spacing:.02em}",
      "#pg-chat-panel{position:fixed;bottom:156px;inset-inline-end:18px;width:min(380px,calc(100vw - 20px));",
      "max-height:min(560px,74vh);display:none;flex-direction:column;background:#0e0e10;border:1px solid rgba(212,175,55,.4);",
      "border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.55)}",
      "#pg-chat-panel.open{display:flex}",
      "#pg-chat-head{padding:12px 14px;background:linear-gradient(90deg,rgba(212,175,55,.16),rgba(212,175,55,.05));",
      "color:#f0d78c;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}",
      "#pg-chat-head small{display:block;font-weight:500;color:rgba(240,215,140,.7);font-size:11px;margin-top:2px}",
      "#pg-chat-body{padding:12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:8px;background:#0b0b0d}",
      ".pg-msg{padding:10px 12px;border-radius:14px;max-width:94%;line-height:1.55;font-size:13.5px;white-space:pre-wrap}",
      ".pg-msg.bot{background:rgba(255,255,255,.06);color:#eee;align-self:flex-start;border:1px solid rgba(255,255,255,.04)}",
      ".pg-msg.user{background:rgba(212,175,55,.18);color:#f5e6a6;align-self:flex-end;border:1px solid rgba(212,175,55,.15)}",
      ".pg-qr{align-self:flex-start;background:#fff;padding:8px;border-radius:12px;margin:2px 0}",
      "#pg-chat-actions{padding:10px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid rgba(255,255,255,.06);background:#101012}",
      "#pg-chat-actions button,.pg-chat-link{border:1px solid rgba(212,175,55,.4);background:rgba(212,175,55,.06);color:#e6c65c;",
      "border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer;text-decoration:none}",
      "#pg-chat-actions button.primary{background:linear-gradient(135deg,#d4af37,#c49a2c);color:#111;border-color:transparent;font-weight:700}",
      "#pg-chat-input-row{display:none;padding:8px;gap:6px;border-top:1px solid rgba(255,255,255,.06);background:#101012}",
      "#pg-chat-input-row.show{display:flex}",
      "#pg-chat-input{flex:1;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:#0b0b0c;color:#eee;padding:10px 12px}",
      "#pg-chat-send{border:none;border-radius:12px;background:#d4af37;color:#111;font-weight:700;padding:0 14px;cursor:pointer}"
    ].join("");
    document.head.appendChild(css);

    var root = document.createElement("div");
    root.id = "pg-chat-root";
    root.innerHTML = [
      '<button type="button" id="pg-chat-bubble" aria-label="Sales chat">Chat</button>',
      '<div id="pg-chat-panel" role="dialog" aria-label="PAROKH Sales Bot">',
      '  <div id="pg-chat-head"><div><span>PAROKH GOLD</span><small id="pg-chat-status">Sales Bot</small></div>',
      '  <button type="button" id="pg-chat-close" style="background:none;border:none;color:#d4af37;cursor:pointer;font-size:16px">✕</button></div>',
      '  <div id="pg-chat-body"></div>',
      '  <div id="pg-chat-actions"></div>',
      '  <div id="pg-chat-input-row"><input id="pg-chat-input" autocomplete="off" /><button type="button" id="pg-chat-send">OK</button></div>',
      '</div>'
    ].join("");
    document.body.appendChild(root);

    document.getElementById("pg-chat-bubble").onclick = function () { openPanel(); };
    document.getElementById("pg-chat-close").onclick = function () {
      document.getElementById("pg-chat-panel").classList.remove("open");
    };
    document.getElementById("pg-chat-send").onclick = onSend;
    document.getElementById("pg-chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") onSend();
    });
  }

  function bodyEl() { return document.getElementById("pg-chat-body"); }
  function bot(text) {
    var d = document.createElement("div");
    d.className = "pg-msg bot";
    d.textContent = text;
    bodyEl().appendChild(d);
    bodyEl().scrollTop = bodyEl().scrollHeight;
  }
  function user(text) {
    var d = document.createElement("div");
    d.className = "pg-msg user";
    d.textContent = text;
    bodyEl().appendChild(d);
    bodyEl().scrollTop = bodyEl().scrollHeight;
  }
  function botQr(wallet) {
    if (!wallet) return;
    var wrap = document.createElement("div");
    wrap.className = "pg-qr";
    wrap.id = "pg-chat-qr";
    bodyEl().appendChild(wrap);
    if (window.ParokhQR) {
      try { ParokhQR.render(wrap, wallet, 160); } catch (e) {}
    } else if (typeof QRCode !== "undefined") {
      try { new QRCode(wrap, { text: wallet, width: 160, height: 160 }); } catch (e) {}
    } else {
      wrap.textContent = wallet;
      wrap.style.color = "#333";
      wrap.style.fontSize = "10px";
      wrap.style.maxWidth = "160px";
      wrap.style.wordBreak = "break-all";
    }
    bodyEl().scrollTop = bodyEl().scrollHeight;
  }
  function actions(items) {
    var a = document.getElementById("pg-chat-actions");
    a.innerHTML = "";
    items.forEach(function (it) {
      if (it.href) {
        var link = document.createElement("a");
        link.className = "pg-chat-link";
        link.href = it.href;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = it.label;
        a.appendChild(link);
      } else {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = it.label;
        if (it.primary) btn.className = "primary";
        btn.onclick = it.onClick;
        a.appendChild(btn);
      }
    });
  }
  function showInput(placeholder) {
    var row = document.getElementById("pg-chat-input-row");
    var input = document.getElementById("pg-chat-input");
    row.classList.add("show");
    input.value = "";
    input.placeholder = placeholder || "";
    setTimeout(function () { input.focus(); }, 30);
  }
  function hideInput() {
    document.getElementById("pg-chat-input-row").classList.remove("show");
  }
  function setStatus(s) {
    var el = document.getElementById("pg-chat-status");
    if (el) el.textContent = s;
  }

  function home() {
    state = resetState();
    hideInput();
    setStatus(t("منوی اصلی", "Main menu"));
    bot(t(
      "به ربات فروش PAROKH GOLD خوش آمدید.\nیک گزینه را انتخاب کنید:",
      "Welcome to PAROKH GOLD sales bot.\nChoose an option:"
    ));
    actions([
      { label: t("🛒 خرید", "🛒 Buy"), primary: true, onClick: startBuy },
      { label: t("🎁 دمو", "🎁 Demo"), onClick: startDemo },
      { label: t("ℹ️ راهنما", "ℹ️ Info"), onClick: showInfo },
      { label: t("🔎 پیگیری", "🔎 Track"), onClick: startTrack },
      { label: t("ربات تلگرام", "Telegram bot"), href: BOT },
      { label: t("پشتیبانی انسانی", "Human support"), href: HUMAN }
    ]);
  }

  function startBuy() {
    state.intent = "buy";
    state.step = "plan";
    user(t("خرید", "Buy"));
    setStatus(t("خرید · انتخاب پلن", "Buy · plan"));
    bot(t(
      "پلن را انتخاب کنید:\n• ۱ ماه — $39\n• ۶ ماه — $119\n• ۱۲ ماه — $199\n\nهر خرید فقط برای یک حساب MT5 است.",
      "Choose a plan:\n• 1 month — $39\n• 6 months — $119\n• 12 months — $199\n\nOne purchase = one MT5 account."
    ));
    actions([
      { label: "$39 / 1m", onClick: function () { pickPlan("1m"); } },
      { label: "$119 / 6m", primary: true, onClick: function () { pickPlan("6m"); } },
      { label: "$199 / 12m", onClick: function () { pickPlan("12m"); } },
      { label: t("منو", "Menu"), onClick: home }
    ]);
  }

  function startDemo() {
    state.intent = "demo";
    state.step = "name";
    user(t("دمو", "Demo"));
    setStatus(t("دمو · نام", "Demo · name"));
    bot(t("نام شما را وارد کنید:", "Enter your name:"));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput(t("نام", "Name"));
  }

  function showInfo() {
    user(t("راهنما", "Info"));
    bot(t(
      "PAROKH GOLD EA برای MetaTrader 5\n• پرداخت: USDT شبکه TRON (TRC-20)\n• تحویل: فایل EX5 اختصاصی تا پایان پلن\n• بدون لایسنس جدا / بدون ثبت‌نام اجباری\n• پشتیبانی انسانی: @Parokhgoldea",
      "PAROKH GOLD EA for MetaTrader 5\n• Payment: USDT on TRON (TRC-20)\n• Delivery: dedicated EX5 until plan ends\n• No separate license file / no forced sign-up\n• Human support: @Parokhgoldea"
    ));
    actions([
      { label: t("خرید", "Buy"), primary: true, onClick: startBuy },
      { label: t("دمو", "Demo"), onClick: startDemo },
      { label: t("منو", "Menu"), onClick: home }
    ]);
  }

  function startTrack() {
    state.step = "track";
    user(t("پیگیری", "Track"));
    bot(t(
      "کد سفارش (مثلاً PG-…) را بفرستید. وضعیت نهایی پس از بررسی پرداخت از ایمیل اعلام می‌شود.",
      "Send your order id (e.g. PG-…). Final status is confirmed by email after payment review."
    ));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput("PG-...");
  }

  function pickPlan(p) {
    state.plan = p;
    state.step = "name";
    user(p + " · $" + PRICES[p]);
    setStatus(t("خرید · نام", "Buy · name"));
    bot(t("نام شما را وارد کنید:", "Enter your name:"));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput(t("نام", "Name"));
  }

  function onSend() {
    var input = document.getElementById("pg-chat-input");
    var v = (input.value || "").trim();
    if (!v) return;
    user(v);
    input.value = "";

    if (state.step === "name") {
      state.name = v;
      state.step = "email";
      setStatus(state.intent === "demo" ? t("دمو · ایمیل", "Demo · email") : t("خرید · ایمیل", "Buy · email"));
      bot(t("ایمیل خود را وارد کنید:", "Enter your email:"));
      showInput("email@example.com");
      return;
    }
    if (state.step === "email") {
      if (!validEmail(v.toLowerCase())) {
        bot(t("ایمیل معتبر نیست. دوباره وارد کنید:", "Invalid email. Try again:"));
        showInput("email@example.com");
        return;
      }
      state.email = v.toLowerCase();
      if (state.intent === "buy") {
        state.step = "confirm";
        hideInput();
        bot(t(
          "تأیید نهایی:\nپلن: " + state.plan + " · $" + PRICES[state.plan] + "\nنام: " + state.name + "\nایمیل: " + state.email + "\n\nادامه = پذیرش تحویل EX5 برای یک حساب MT5",
          "Confirm:\nPlan: " + state.plan + " · $" + PRICES[state.plan] + "\nName: " + state.name + "\nEmail: " + state.email + "\n\nContinue = accept EX5 for one MT5 account"
        ));
        actions([
          { label: t("تأیید و پرداخت", "Confirm & pay"), primary: true, onClick: submitOrder },
          { label: t("انصراف", "Cancel"), onClick: home }
        ]);
      } else {
        hideInput();
        submitOrder();
      }
      return;
    }
    if (state.step === "txid") {
      submitTxid(v);
      return;
    }
    if (state.step === "track") {
      hideInput();
      bot(t(
        "کد «" + v + "» ثبت شد برای پیگیری.\nپس از بررسی پرداخت، از ایمیل با شما تماس گرفته می‌شود.\nپشتیبانی: @Parokhgoldea",
        "Order id «" + v + "» noted.\nAfter payment review we contact you by email.\nSupport: @Parokhgoldea"
      ));
      actions([
        { label: t("پشتیبانی", "Support"), href: HUMAN },
        { label: t("منو", "Menu"), onClick: home }
      ]);
      state.step = "home";
    }
  }

  async function submitOrder() {
    bot(t("در حال ثبت…", "Submitting…"));
    actions([]);
    try {
      var r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: state.intent === "demo" ? "demo" : "full",
          plan: state.intent === "demo" ? "demo" : state.plan,
          name: state.name,
          email: state.email,
          refundAcknowledged: true,
          source: "chatbot",
          replyChannel: "email"
        })
      });
      var text = await r.text();
      var d;
      try { d = JSON.parse(text); } catch (e) {
        throw new Error(t("پاسخ سرور نامعتبر است.", "Invalid server response."));
      }
      if (!r.ok) throw new Error(d.error || "error");
      state.order = d.order;

      if (state.intent === "demo") {
        setStatus(t("دمو ثبت شد", "Demo submitted"));
        bot(t(
          "درخواست دمو ثبت شد.\nکد: " + (d.order && d.order.id) + "\nادامه از ایمیل یا ربات تلگرام.",
          "Demo request submitted.\nID: " + (d.order && d.order.id) + "\nContinue by email or Telegram bot."
        ));
        actions([
          { label: t("ربات دمو", "Demo bot"), href: BOT + "?start=demo" },
          { label: t("خرید", "Buy"), onClick: startBuy },
          { label: t("منو", "Menu"), onClick: home }
        ]);
        return;
      }

      var pay = d.payment || {};
      var wallet = pay.wallet || "";
      state.wallet = wallet;
      state.step = "txid";
      setStatus(t("پرداخت · TXID", "Pay · TXID"));
      bot(t(
        "سفارش ثبت شد: " + (d.order && d.order.id) + "\nمبلغ دقیق: $" + (pay.amount != null ? pay.amount : PRICES[state.plan]) + " USDT\nشبکه: TRON (TRC-20)\nآدرس ولت:\n" + wallet + "\n\nپرداخت کنید، سپس TXID را بفرستید.",
        "Order created: " + (d.order && d.order.id) + "\nExact amount: $" + (pay.amount != null ? pay.amount : PRICES[state.plan]) + " USDT\nNetwork: TRON (TRC-20)\nWallet:\n" + wallet + "\n\nPay, then send TXID."
      ));
      botQr(wallet);
      showInput("TXID");
      actions([
        { label: t("کپی ولت", "Copy wallet"), primary: true, onClick: function () {
          if (state.wallet && navigator.clipboard) {
            navigator.clipboard.writeText(state.wallet);
            bot(t("آدرس کپی شد.", "Wallet copied."));
          }
        }},
        { label: t("صفحه QR", "QR page"), onClick: function () { location.href = "purchase.html#order"; } },
        { label: t("ربات تلگرام", "Telegram bot"), href: BOT + "?start=buy" },
        { label: t("منو", "Menu"), onClick: home }
      ]);
    } catch (e) {
      bot((e && e.message) || "Error");
      actions([{ label: t("دوباره", "Retry"), onClick: home }]);
    }
  }

  async function submitTxid(txid) {
    if (!state.order || !state.order.id) return;
    if (txid.length < 20) {
      bot(t("TXID کوتاه است. دوباره بفرستید:", "TXID too short. Send again:"));
      showInput("TXID");
      return;
    }
    try {
      var r = await fetch("/api/payment/txid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: state.order.id, txid: txid, email: state.email })
      });
      var d = JSON.parse(await r.text());
      if (!r.ok) throw new Error(d.error || "error");
      hideInput();
      setStatus(t("TXID ثبت شد", "TXID saved"));
      bot(t(
        "TXID ثبت شد و در صف بررسی است.\nسفارش: " + state.order.id + "\nپس از تأیید، از ایمیل ادامه می‌دهیم (مشخصات MT5 و تحویل EX5).",
        "TXID saved for review.\nOrder: " + state.order.id + "\nAfter approval we continue by email (MT5 details & EX5 delivery)."
      ));
      actions([
        { label: t("پشتیبانی", "Support"), href: HUMAN },
        { label: t("منو", "Menu"), onClick: home }
      ]);
      state.step = "done";
    } catch (e) {
      bot((e && e.message) || "Error");
      showInput("TXID");
    }
  }

  function openPanel(intent) {
    ensureUi();
    document.getElementById("pg-chat-panel").classList.add("open");
    bodyEl().innerHTML = "";
    if (intent === "buy") startBuy();
    else if (intent === "demo") startDemo();
    else home();
  }

  window.ParokhChat = { open: openPanel };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUi);
  } else ensureUi();
})();
