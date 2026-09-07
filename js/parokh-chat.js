/* PAROKH GOLD v2.0 site chatbot — sales + demo */
(function () {
  var BOT = "https://t.me/ParokhGoldEABot";
  var HUMAN = "https://t.me/Parokhgoldea";
  var state = { step: "home", intent: null, plan: "6m", name: "", email: "" };

  function isFa() {
    return (document.documentElement.lang || "").indexOf("fa") === 0 ||
      document.documentElement.getAttribute("dir") === "rtl";
  }
  function t(fa, en) { return isFa() ? fa : en; }

  function ensureUi() {
    if (document.getElementById("pg-chat-root")) return;
    var css = document.createElement("style");
    css.textContent = [
      "#pg-chat-root{position:fixed;z-index:9999;font-family:inherit}",
      "#pg-chat-bubble{position:fixed;bottom:88px;inset-inline-end:18px;width:56px;height:56px;border-radius:50%;",
      "background:linear-gradient(135deg,#d4af37,#f0d78c);color:#111;border:none;box-shadow:0 8px 24px rgba(212,175,55,.35);",
      "cursor:pointer;font-weight:700;font-size:13px}",
      "#pg-chat-panel{position:fixed;bottom:156px;inset-inline-end:18px;width:min(360px,calc(100vw - 24px));",
      "max-height:min(520px,70vh);display:none;flex-direction:column;background:#121214;border:1px solid rgba(212,175,55,.35);",
      "border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.5)}",
      "#pg-chat-panel.open{display:flex}",
      "#pg-chat-head{padding:12px 14px;background:rgba(212,175,55,.12);color:#f0d78c;font-weight:600;display:flex;justify-content:space-between;align-items:center}",
      "#pg-chat-body{padding:12px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:8px}",
      ".pg-msg{padding:10px 12px;border-radius:12px;max-width:92%;line-height:1.5;font-size:14px}",
      ".pg-msg.bot{background:rgba(255,255,255,.06);color:#eee;align-self:flex-start}",
      ".pg-msg.user{background:rgba(212,175,55,.18);color:#f5e6a6;align-self:flex-end}",
      "#pg-chat-actions{padding:10px;display:flex;flex-wrap:wrap;gap:6px;border-top:1px solid rgba(255,255,255,.06)}",
      "#pg-chat-actions button,.pg-chat-link{border:1px solid rgba(212,175,55,.35);background:transparent;color:#d4af37;",
      "border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer;text-decoration:none}",
      "#pg-chat-input-row{display:none;padding:8px;gap:6px;border-top:1px solid rgba(255,255,255,.06)}",
      "#pg-chat-input-row.show{display:flex}",
      "#pg-chat-input{flex:1;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b0b0c;color:#eee;padding:8px 10px}"
    ].join("");
    document.head.appendChild(css);

    var root = document.createElement("div");
    root.id = "pg-chat-root";
    root.innerHTML = [
      '<button type="button" id="pg-chat-bubble" aria-label="Chat">Chat</button>',
      '<div id="pg-chat-panel" role="dialog" aria-label="PAROKH Chat">',
      '  <div id="pg-chat-head"><span>PAROKH GOLD</span><button type="button" id="pg-chat-close" style="background:none;border:none;color:#d4af37;cursor:pointer">✕</button></div>',
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

  function bot(text) {
    var b = document.getElementById("pg-chat-body");
    var d = document.createElement("div");
    d.className = "pg-msg bot";
    d.textContent = text;
    b.appendChild(d);
    b.scrollTop = b.scrollHeight;
  }
  function user(text) {
    var b = document.getElementById("pg-chat-body");
    var d = document.createElement("div");
    d.className = "pg-msg user";
    d.textContent = text;
    b.appendChild(d);
    b.scrollTop = b.scrollHeight;
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
    input.focus();
  }
  function hideInput() {
    document.getElementById("pg-chat-input-row").classList.remove("show");
  }

  function home() {
    state = { step: "home", intent: null, plan: "6m", name: "", email: "" };
    hideInput();
    bot(t("سلام. خرید، دمو یا پشتیبانی؟", "Hi. Buy, demo, or support?"));
    actions([
      { label: t("خرید", "Buy"), onClick: function () { startBuy(); } },
      { label: t("دمو", "Demo"), onClick: function () { startDemo(); } },
      { label: t("ربات تلگرام", "Telegram bot"), href: BOT },
      { label: t("پشتیبانی انسانی", "Human support"), href: HUMAN }
    ]);
  }

  function startBuy() {
    state.intent = "buy";
    state.step = "plan";
    user(t("خرید", "Buy"));
    bot(t("پلن را انتخاب کنید:", "Choose a plan:"));
    actions([
      { label: "$39 / 1m", onClick: function () { pickPlan("1m"); } },
      { label: "$119 / 6m", onClick: function () { pickPlan("6m"); } },
      { label: "$199 / 12m", onClick: function () { pickPlan("12m"); } }
    ]);
  }
  function startDemo() {
    state.intent = "demo";
    state.step = "name";
    user(t("دمو", "Demo"));
    bot(t("نام شما؟", "Your name?"));
    actions([]);
    showInput(t("نام", "Name"));
  }
  function pickPlan(p) {
    state.plan = p;
    state.step = "name";
    user(p);
    bot(t("نام شما؟", "Your name?"));
    actions([]);
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
      bot(t("ایمیل؟", "Email?"));
      showInput("email@example.com");
      return;
    }
    if (state.step === "email") {
      state.email = v.toLowerCase();
      hideInput();
      submitChat();
      return;
    }
    if (state.step === "txid") {
      submitTxid(v);
      return;
    }
  }

  async function submitChat() {
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
      var d = JSON.parse(text);
      if (!r.ok) throw new Error(d.error || "error");
      state.order = d.order;
      if (state.intent === "demo") {
        bot(t("درخواست دمو ثبت شد. می‌توانید در ربات هم ادامه دهید.", "Demo request saved. You can continue in the bot."));
        actions([
          { label: t("ربات", "Bot"), href: BOT + "?start=demo" },
          { label: t("شروع دوباره", "Restart"), onClick: home }
        ]);
        return;
      }
      var pay = d.payment || {};
      var wallet = pay.wallet || "";
      bot(t(
        "سفارش " + (d.order && d.order.id) + " ثبت شد.\nمبلغ: $" + (pay.amount || "") + " USDT (TRC-20)\nآدرس:\n" + wallet + "\nپس از پرداخت، TXID را بفرستید.",
        "Order " + (d.order && d.order.id) + " created.\nAmount: $" + (pay.amount || "") + " USDT (TRC-20)\nWallet:\n" + wallet + "\nAfter payment, send TXID."
      ));
      state.step = "txid";
      state.wallet = wallet;
      showInput("TXID");
      actions([
        { label: t("کپی آدرس ولت", "Copy wallet"), onClick: function () {
          if (state.wallet && navigator.clipboard) navigator.clipboard.writeText(state.wallet);
          bot(t("آدرس کپی شد.", "Wallet copied."));
        } },
        { label: t("صفحه خرید + QR", "Purchase page + QR"), onClick: function () { location.href = "purchase.html#order"; } },
        { label: t("ربات", "Bot"), href: BOT + "?start=buy" }
      ]);
    } catch (e) {
      bot((e && e.message) || "Error");
      actions([{ label: t("دوباره", "Retry"), onClick: home }]);
    }
  }

  async function submitTxid(txid) {
    if (!state.order || !state.order.id) return;
    try {
      var r = await fetch("/api/payment/txid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: state.order.id, txid: txid, email: state.email })
      });
      var d = JSON.parse(await r.text());
      if (!r.ok) throw new Error(d.error || "error");
      hideInput();
      bot(t("TXID ثبت شد. پس از بررسی با ایمیل ادامه می‌دهیم.", "TXID saved. We continue by email after review."));
      actions([
        { label: t("پشتیبانی", "Support"), href: HUMAN },
        { label: t("شروع دوباره", "Restart"), onClick: home }
      ]);
      state.step = "done";
    } catch (e) {
      bot((e && e.message) || "Error");
    }
  }

  function openPanel(intent) {
    ensureUi();
    document.getElementById("pg-chat-panel").classList.add("open");
    document.getElementById("pg-chat-body").innerHTML = "";
    if (intent === "buy") startBuy();
    else if (intent === "demo") startDemo();
    else home();
  }

  window.ParokhChat = { open: openPanel };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUi);
  } else ensureUi();
})();
