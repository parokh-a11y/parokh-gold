/* PAROKH GOLD v2.0.4 — fixed panel, theme, account after pay */
(function () {
  var PRICES = { "1m": 39, "6m": 119, "12m": 199 };
  var STORE_KEY = "parokh_chat_v204";
  var state = loadState() || resetState();

  function resetState() {
    return {
      step: "home", intent: null, plan: "6m",
      name: "", email: "", broker: "", account: "",
      order: null, wallet: "", history: [], minimized: false
    };
  }
  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); }
    catch (e) { return null; }
  }
  function saveState() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        step: state.step, intent: state.intent, plan: state.plan,
        name: state.name, email: state.email, broker: state.broker, account: state.account,
        order: state.order, wallet: state.wallet,
        history: (state.history || []).slice(-40),
        minimized: !!state.minimized
      }));
    } catch (e) {}
  }
  function isFa() {
    return (document.documentElement.lang || "").indexOf("fa") === 0 ||
      document.documentElement.getAttribute("dir") === "rtl";
  }
  function t(fa, en) { return isFa() ? fa : en; }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  function ensureUi() {
    if (document.getElementById("pg-chat-root")) { applyThemeClass(); return; }
    var css = document.createElement("style");
    css.id = "pg-chat-style";
    css.textContent = [
      "#pg-chat-root{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:inherit}",
      "#pg-chat-bubble{pointer-events:auto;position:fixed;bottom:max(88px,env(safe-area-inset-bottom));inset-inline-end:18px;",
      "width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#d4af37,#f0d78c);color:#111;",
      "border:none;box-shadow:0 8px 24px rgba(212,175,55,.4);cursor:pointer;font-weight:800;font-size:12px;z-index:9002}",
      "#pg-chat-panel{pointer-events:auto;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);",
      "width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 120px));max-height:calc(100dvh - 100px);",
      "display:none;flex-direction:column;border-radius:18px;overflow:hidden;z-index:9003;",
      "box-shadow:0 18px 50px rgba(0,0,0,.45);font-family:inherit}",
      "#pg-chat-panel.open{display:flex}",
      "#pg-chat-panel.minimized{display:none!important}",
      /* theme via data attribute on panel */
      "#pg-chat-panel.pg-dark{background:#0e0e10;border:1px solid rgba(212,175,55,.4);color:#eee}",
      "#pg-chat-panel.pg-light{background:#f7f7f8;border:1px solid rgba(0,0,0,.12);color:#222}",
      "#pg-chat-head{padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;",
      "background:linear-gradient(90deg,rgba(212,175,55,.2),rgba(212,175,55,.05));color:#c9a227;font-weight:700;flex-shrink:0}",
      "#pg-chat-head small{display:block;font-weight:500;opacity:.75;font-size:11px;margin-top:2px}",
      "#pg-chat-head .pg-tools{display:flex;gap:6px}",
      "#pg-chat-head button{background:none;border:none;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:4px}",
      "#pg-chat-body{padding:12px;overflow-y:auto;overflow-x:hidden;flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}",
      "#pg-chat-panel.pg-dark #pg-chat-body{background:#0b0b0d}",
      "#pg-chat-panel.pg-light #pg-chat-body{background:#fff}",
      ".pg-msg{padding:10px 12px;border-radius:14px;max-width:94%;line-height:1.55;font-size:13.5px;white-space:pre-wrap;overflow-wrap:anywhere}",
      "#pg-chat-panel.pg-dark .pg-msg.bot{background:rgba(255,255,255,.06);color:#eee}",
      "#pg-chat-panel.pg-light .pg-msg.bot{background:#f0f0f2;color:#222}",
      ".pg-msg.user{background:rgba(212,175,55,.18);color:#8a6a10;align-self:flex-end}",
      "#pg-chat-panel.pg-dark .pg-msg.user{color:#f5e6a6}",
      ".pg-msg.bot{align-self:flex-start}",
      ".pg-qr{align-self:flex-start;background:#fff;padding:8px;border-radius:12px;margin:2px 0}",
      "#pg-chat-actions{padding:10px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid rgba(127,127,127,.2);flex-shrink:0}",
      "#pg-chat-actions button{border:1px solid rgba(212,175,55,.45);background:rgba(212,175,55,.08);color:#b8941f;",
      "border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer;font-family:inherit}",
      "#pg-chat-actions button.primary{background:linear-gradient(135deg,#d4af37,#c49a2c);color:#111;border-color:transparent;font-weight:700}",
      "#pg-chat-input-row{display:none;padding:8px;gap:6px;border-top:1px solid rgba(127,127,127,.2);flex-shrink:0}",
      "#pg-chat-input-row.show{display:flex}",
      "#pg-chat-input{flex:1;min-width:0;border-radius:12px;border:1px solid rgba(127,127,127,.25);padding:10px 12px;",
      "font-size:16px;font-family:inherit;overflow-x:auto}",
      "#pg-chat-panel.pg-dark #pg-chat-input{background:#0b0b0c;color:#eee}",
      "#pg-chat-panel.pg-light #pg-chat-input{background:#fff;color:#111}",
      "#pg-chat-send{border:none;border-radius:12px;background:#d4af37;color:#111;font-weight:700;padding:0 14px;cursor:pointer;font-family:inherit}",
      "@media (max-width:520px){#pg-chat-panel{height:min(520px,calc(100dvh - 96px));top:48%;}}"
    ].join("");
    document.head.appendChild(css);

    var root = document.createElement("div");
    root.id = "pg-chat-root";
    root.innerHTML = [
      '<button type="button" id="pg-chat-bubble" aria-label="Chat">Chat</button>',
      '<div id="pg-chat-panel" role="dialog" aria-label="PAROKH Chat">',
      '  <div id="pg-chat-head"><div><span>PAROKH GOLD</span><small id="pg-chat-status">Chat</small></div>',
      '  <div class="pg-tools">',
      '    <button type="button" id="pg-chat-min" title="Minimize">—</button>',
      '    <button type="button" id="pg-chat-close" title="Close">✕</button>',
      '  </div></div>',
      '  <div id="pg-chat-body"></div>',
      '  <div id="pg-chat-actions"></div>',
      '  <div id="pg-chat-input-row"><input id="pg-chat-input" autocomplete="off" /><button type="button" id="pg-chat-send">OK</button></div>',
      '</div>'
    ].join("");
    document.body.appendChild(root);

    document.getElementById("pg-chat-bubble").onclick = function () {
      state.minimized = false; openPanel();
    };
    document.getElementById("pg-chat-close").onclick = function () {
      document.getElementById("pg-chat-panel").classList.remove("open");
      saveState();
    };
    document.getElementById("pg-chat-min").onclick = function () {
      state.minimized = true;
      var p = document.getElementById("pg-chat-panel");
      p.classList.remove("open");
      p.classList.add("minimized");
      saveState();
    };
    document.getElementById("pg-chat-send").onclick = onSend;
    document.getElementById("pg-chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") onSend();
    });

    // keyboard / viewport — keep panel usable
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", fitViewport);
      window.visualViewport.addEventListener("scroll", fitViewport);
    }
    var obs = new MutationObserver(applyThemeClass);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    applyThemeClass();
  }

  function isLightTheme() {
    var th = document.documentElement.getAttribute("data-theme") || "";
    if (th === "light") return true;
    if (th === "dark") return false;
    return document.body.classList.contains("theme-light");
  }
  function applyThemeClass() {
    var panel = document.getElementById("pg-chat-panel");
    if (!panel) return;
    panel.classList.toggle("pg-light", isLightTheme());
    panel.classList.toggle("pg-dark", !isLightTheme());
  }
  function fitViewport() {
    var panel = document.getElementById("pg-chat-panel");
    if (!panel || !panel.classList.contains("open") || !window.visualViewport) return;
    var vv = window.visualViewport;
    var h = Math.min(560, Math.max(280, vv.height - 24));
    panel.style.height = h + "px";
    panel.style.top = (vv.offsetTop + vv.height / 2) + "px";
  }

  function bodyEl() { return document.getElementById("pg-chat-body"); }
  function pushHist(role, text) {
    state.history = state.history || [];
    state.history.push({ role: role, text: text });
    saveState();
  }
  function bot(text, skipHist) {
    var d = document.createElement("div");
    d.className = "pg-msg bot";
    d.textContent = text;
    bodyEl().appendChild(d);
    bodyEl().scrollTop = bodyEl().scrollHeight;
    if (!skipHist) pushHist("bot", text);
  }
  function user(text, skipHist) {
    var d = document.createElement("div");
    d.className = "pg-msg user";
    d.textContent = text;
    bodyEl().appendChild(d);
    bodyEl().scrollTop = bodyEl().scrollHeight;
    if (!skipHist) pushHist("user", text);
  }
  function botQr(wallet) {
    if (!wallet) return;
    var wrap = document.createElement("div");
    wrap.className = "pg-qr";
    bodyEl().appendChild(wrap);
    if (window.ParokhQR) {
      try { ParokhQR.render(wrap, wallet, 160); } catch (e) {}
    } else if (typeof QRCode !== "undefined") {
      try { new QRCode(wrap, { text: wallet, width: 160, height: 160 }); } catch (e) {}
    }
    bodyEl().scrollTop = bodyEl().scrollHeight;
  }
  function actions(items) {
    var a = document.getElementById("pg-chat-actions");
    a.innerHTML = "";
    items.forEach(function (it) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = it.label;
      if (it.primary) btn.className = "primary";
      btn.onclick = it.onClick;
      a.appendChild(btn);
    });
  }
  function showInput(placeholder) {
    var row = document.getElementById("pg-chat-input-row");
    var input = document.getElementById("pg-chat-input");
    row.classList.add("show");
    input.value = "";
    input.placeholder = placeholder || "";
    setTimeout(function () { try { input.focus(); } catch (e) {} fitViewport(); }, 40);
  }
  function hideInput() {
    document.getElementById("pg-chat-input-row").classList.remove("show");
  }
  function setStatus(s) {
    var el = document.getElementById("pg-chat-status");
    if (el) el.textContent = s;
  }
  function navBackBuy() {
    if (state.step === "email") { state.step = "name"; askName(); return; }
    if (state.step === "name" || state.step === "plan") { startBuy(); return; }
    if (state.step === "confirm") { state.step = "email"; askEmail(); return; }
    if (state.step === "broker") { state.step = "txid"; /* stay near pay */ askBroker(); return; }
    home();
  }
  function navBackDemo() {
    if (state.step === "email") { state.step = "name"; askName(); return; }
    home();
  }

  function restoreHistory() {
    bodyEl().innerHTML = "";
    (state.history || []).forEach(function (h) {
      if (h.role === "user") user(h.text, true);
      else bot(h.text, true);
    });
    if (state.step === "txid" && state.wallet) botQr(state.wallet);
    rebuildActionsForStep();
  }

  function rebuildActionsForStep() {
    if (state.step === "home") { home(true); return; }
    if (state.step === "plan") { startBuy(true); return; }
    if (state.step === "confirm") {
      actions([
        { label: t("تأیید و پرداخت", "Confirm & pay"), primary: true, onClick: submitOrder },
        { label: t("بازگشت", "Back"), onClick: navBackBuy },
        { label: t("منو", "Menu"), onClick: home }
      ]);
      return;
    }
    if (state.step === "txid" || state.step === "broker" || state.step === "account") {
      actions([
        { label: t("کپی آدرس", "Copy address"), primary: true, onClick: copyWallet },
        { label: t("منو", "Menu"), onClick: home }
      ]);
      if (state.step === "txid") showInput("TXID");
      else if (state.step === "broker") showInput(t("نام بروکر", "Broker"));
      else if (state.step === "account") showInput(t("شماره حساب", "Account"));
      return;
    }
    if (state.step === "name" || state.step === "email") {
      actions([
        { label: t("بازگشت", "Back"), onClick: state.intent === "demo" ? navBackDemo : navBackBuy },
        { label: t("منو", "Menu"), onClick: home }
      ]);
      showInput(state.step === "email" ? "email@example.com" : t("نام", "Name"));
      return;
    }
    actions([{ label: t("منو", "Menu"), onClick: home }]);
  }

  function home(skipIntro) {
    state.step = "home";
    state.intent = null;
    hideInput();
    setStatus(t("منوی اصلی", "Main menu"));
    if (!skipIntro) {
      bodyEl().innerHTML = "";
      state.history = [];
      bot(t(
        "سلام. از همین‌جا می‌توانید دمو بگیرید یا خرید کنید.",
        "Hi. Request a demo or buy right here."
      ));
    }
    actions([
      { label: t("خرید", "Buy"), primary: true, onClick: startBuy },
      { label: t("دمو", "Demo"), onClick: startDemo },
      { label: t("راهنما", "Info"), onClick: showInfo },
      { label: t("پیگیری", "Track"), onClick: startTrack }
    ]);
    saveState();
  }

  function startBuy(skipUser) {
    state.intent = "buy";
    state.step = "plan";
    if (!skipUser) user(t("خرید", "Buy"));
    setStatus(t("خرید · پلن", "Buy · plan"));
    bot(t(
      "پلن را انتخاب کنید:\n۱ ماه — $39\n۶ ماه — $119\n۱۲ ماه — $199\n\nهر خرید فقط برای یک حساب MT5.",
      "Choose a plan:\n1 month — $39\n6 months — $119\n12 months — $199\n\nOne purchase = one MT5 account."
    ));
    actions([
      { label: "$39 / 1m", onClick: function () { pickPlan("1m"); } },
      { label: "$119 / 6m", primary: true, onClick: function () { pickPlan("6m"); } },
      { label: "$199 / 12m", onClick: function () { pickPlan("12m"); } },
      { label: t("منو", "Menu"), onClick: home }
    ]);
    hideInput();
    saveState();
  }

  function startDemo() {
    state.intent = "demo";
    state.step = "name";
    user(t("دمو", "Demo"));
    askName();
  }

  function showInfo() {
    user(t("راهنما", "Info"));
    bot(t(
      "PAROKH GOLD EA برای MetaTrader 5\n• پرداخت: USDT روی TRON\n• تحویل: فایل EX5 اختصاصی تا پایان پلن\n• بدون ثبت‌نام اجباری",
      "PAROKH GOLD EA for MetaTrader 5\n• Payment: USDT on TRON\n• Delivery: dedicated EX5 until plan ends\n• No forced sign-up"
    ));
    actions([
      { label: t("خرید", "Buy"), primary: true, onClick: startBuy },
      { label: t("دمو", "Demo"), onClick: startDemo },
      { label: t("منو", "Menu"), onClick: home }
    ]);
    saveState();
  }

  function startTrack() {
    state.step = "track";
    user(t("پیگیری", "Track"));
    bot(t("کد سفارش را بفرستید. نتیجه از ایمیل اعلام می‌شود.", "Send your order ID. Updates go by email."));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput("PG-...");
    saveState();
  }

  function pickPlan(p) {
    state.plan = p;
    state.step = "name";
    user(p + " · $" + PRICES[p]);
    askName();
  }
  function askName() {
    setStatus(state.intent === "demo" ? t("دمو · نام", "Demo · name") : t("خرید · نام", "Buy · name"));
    bot(t("نام شما چیست؟", "What is your name?"));
    actions([
      { label: t("بازگشت", "Back"), onClick: state.intent === "demo" ? home : startBuy },
      { label: t("منو", "Menu"), onClick: home }
    ]);
    showInput(t("نام", "Name"));
    saveState();
  }
  function askEmail() {
    setStatus(state.intent === "demo" ? t("دمو · ایمیل", "Demo · email") : t("خرید · ایمیل", "Buy · email"));
    bot(t("ایمیل شما چیست؟", "What is your email?"));
    actions([
      { label: t("بازگشت", "Back"), onClick: state.intent === "demo" ? navBackDemo : navBackBuy },
      { label: t("منو", "Menu"), onClick: home }
    ]);
    showInput("email@example.com");
    saveState();
  }
  function askBroker() {
    state.step = "broker";
    setStatus(t("بروکر", "Broker"));
    bot(t("نام بروکر حساب معاملاتی را وارد کنید.", "Enter your broker name."));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput(t("نام بروکر", "Broker"));
    saveState();
  }
  function askAccount() {
    state.step = "account";
    setStatus(t("حساب MT5", "MT5 account"));
    bot(t("شماره حساب MetaTrader 5 را وارد کنید.", "Enter your MetaTrader 5 account number."));
    actions([{ label: t("منو", "Menu"), onClick: home }]);
    showInput(t("شماره حساب", "Account #"));
    saveState();
  }
  function askTxid() {
    state.step = "txid";
    setStatus(t("TXID", "TXID"));
    bot(t("پس از پرداخت، TXID را بفرستید.", "After payment, send the TXID."));
    actions([
      { label: t("کپی آدرس", "Copy address"), primary: true, onClick: copyWallet },
      { label: t("منو", "Menu"), onClick: home }
    ]);
    showInput("TXID");
    saveState();
  }

  function copyWallet() {
    if (state.wallet && navigator.clipboard) {
      navigator.clipboard.writeText(state.wallet);
      bot(t("آدرس کپی شد.", "Address copied."));
    }
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
      askEmail();
      return;
    }
    if (state.step === "email") {
      if (!validEmail(v.toLowerCase())) {
        bot(t("این ایمیل معتبر نیست.", "That email is not valid."));
        showInput("email@example.com");
        return;
      }
      state.email = v.toLowerCase();
      if (state.intent === "buy") {
        state.step = "confirm";
        hideInput();
        bot(t(
          "تأیید کنید:\nپلن: " + state.plan + " · $" + PRICES[state.plan] + "\nنام: " + state.name + "\nایمیل: " + state.email,
          "Confirm:\nPlan: " + state.plan + " · $" + PRICES[state.plan] + "\nName: " + state.name + "\nEmail: " + state.email
        ));
        actions([
          { label: t("تأیید و پرداخت", "Confirm & pay"), primary: true, onClick: submitOrder },
          { label: t("بازگشت", "Back"), onClick: navBackBuy },
          { label: t("منو", "Menu"), onClick: home }
        ]);
        saveState();
      } else {
        hideInput();
        submitOrder();
      }
      return;
    }
    if (state.step === "broker") {
      state.broker = v;
      askAccount();
      return;
    }
    if (state.step === "account") {
      state.account = v;
      askTxid();
      return;
    }
    if (state.step === "txid") {
      submitTxid(v);
      return;
    }
    if (state.step === "track") {
      hideInput();
      bot(t(
        "کد «" + v + "» ثبت شد. نتیجه از ایمیل اعلام می‌شود.",
        "Order id «" + v + "» noted. Updates by email."
      ));
      actions([{ label: t("منو", "Menu"), onClick: home }]);
      state.step = "home";
      saveState();
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
          "درخواست دمو ثبت شد.\nکد: " + (d.order && d.order.id) + "\nپیگیری از ایمیل شما.",
          "Demo request saved.\nID: " + (d.order && d.order.id) + "\nWe will follow up by email."
        ));
        actions([
          { label: t("خرید", "Buy"), onClick: startBuy },
          { label: t("منو", "Menu"), onClick: home }
        ]);
        saveState();
        return;
      }

      var pay = d.payment || {};
      var wallet = pay.wallet || "";
      state.wallet = wallet;
      setStatus(t("پرداخت", "Payment"));
      bot(t(
        "سفارش: " + (d.order && d.order.id) + "\nمبلغ: $" + (pay.amount != null ? pay.amount : PRICES[state.plan]) + " USDT\nشبکه: TRON (TRC-20)\nآدرس:\n" + wallet + "\n\nپرداخت کنید. بعد بروکر، حساب و TXID را می‌گیریم.",
        "Order: " + (d.order && d.order.id) + "\nAmount: $" + (pay.amount != null ? pay.amount : PRICES[state.plan]) + " USDT\nNetwork: TRON (TRC-20)\nWallet:\n" + wallet + "\n\nPay, then we collect broker, account and TXID."
      ));
      botQr(wallet);
      askBroker();
    } catch (e) {
      bot((e && e.message) || "Error");
      actions([{ label: t("دوباره", "Retry"), onClick: home }]);
    }
  }

  async function submitTxid(txid) {
    if (!state.order || !state.order.id) return;
    if (txid.length < 20) {
      bot(t("TXID کوتاه است.", "TXID is too short."));
      showInput("TXID");
      return;
    }
    try {
      var r = await fetch("/api/payment/txid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: state.order.id,
          txid: txid,
          email: state.email,
          broker: state.broker,
          account: state.account
        })
      });
      var d = JSON.parse(await r.text());
      if (!r.ok) throw new Error(d.error || "error");
      hideInput();
      setStatus(t("ثبت شد", "Saved"));
      bot(t(
        "TXID و اطلاعات حساب ثبت شد.\nسفارش: " + state.order.id + "\nادامه از ایمیل شما.",
        "TXID and account info saved.\nOrder: " + state.order.id + "\nWe continue by email."
      ));
      actions([{ label: t("منو", "Menu"), onClick: home }]);
      state.step = "done";
      saveState();
    } catch (e) {
      bot((e && e.message) || "Error");
      showInput("TXID");
    }
  }

  function openPanel(intent) {
    ensureUi();
    state.minimized = false;
    var panel = document.getElementById("pg-chat-panel");
    panel.classList.remove("minimized");
    panel.classList.add("open");
    applyThemeClass();
    fitViewport();
    if (state.history && state.history.length && !intent) {
      restoreHistory();
      return;
    }
    bodyEl().innerHTML = "";
    if (intent === "buy") startBuy();
    else if (intent === "demo") startDemo();
    else if (state.step && state.step !== "home" && state.history && state.history.length) restoreHistory();
    else home();
  }

  window.ParokhChat = { open: openPanel };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { ensureUi(); });
  } else ensureUi();
})();
