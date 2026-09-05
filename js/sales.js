
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
      var sb = window.getParokhSupabase ? await window.getParokhSupabase() : (window.parokhSb || null);
      if (sb && sb.auth) {
        var s = await sb.auth.getSession();
        var token = s && s.data && s.data.session && s.data.session.access_token;
        if (token) h["Authorization"] = "Bearer " + token;
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
            : "Demo request submitted. Contact support on support.";
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
          if (d && d.error === "auth_required") {
            location.href = "login.html?next=" + encodeURIComponent(location.pathname + location.search);
            return;
          }
        } else if (d && (d.order && d.order.id || d.id)) {
          try { await createPaymentForOrder((d.order && d.order.id) || d.id); } catch (pe) { console.warn(pe); }
        }
        if (!r.ok) {
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


/* Payment System V1 UI helpers */
async function parokhAuthHeaders() {
  var h = { "Content-Type": "application/json" };
  try {
    if (window.getParokhSupabase) {
      var sb = await window.getParokhSupabase();
      var sess = await sb.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (token) h["Authorization"] = "Bearer " + token;
    }
  } catch (e) {}
  return h;
}

function showPaymentPanel(pay) {
  var box = document.getElementById("payment-panel");
  if (!box) return;
  box.hidden = false;
  var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v == null ? "—" : String(v); };
  set("pay-order-id", pay.order_id);
  set("pay-amount", pay.amount + " " + (pay.currency || "USDT"));
  set("pay-network", (pay.network || "TRON") + " / " + (pay.standard || "TRC-20"));
  set("pay-wallet", pay.wallet_address);
  set("pay-status", pay.status);
  var qr = document.getElementById("pay-qr");
  if (qr && pay.wallet_address) {
    qr.innerHTML = "";
    qr.dataset.addr = pay.wallet_address;
    if (window.ParokhQR && window.ParokhQR.render) {
      window.ParokhQR.render(qr, pay.wallet_address, 180);
    } else {
      qr.textContent = pay.wallet_address;
      qr.style.fontSize = "11px";
      qr.style.wordBreak = "break-all";
    }
  }
  try { window.__parokhPayment = pay; } catch (e) {}
}

async function createPaymentForOrder(orderId) {
  var headers = await parokhAuthHeaders();
  var r = await fetch("/api/payment/create", { method: "POST", headers: headers, body: JSON.stringify({ orderId: orderId }) });
  var d = await r.json();
  if (!r.ok) throw new Error(d.error || "payment_create_failed");
  showPaymentPanel(d.payment);
  return d.payment;
}

document.addEventListener("DOMContentLoaded", function () {
  var copyBtn = document.getElementById("pay-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var w = document.getElementById("pay-wallet");
      if (!w) return;
      navigator.clipboard.writeText(w.textContent || "").then(function () {
        copyBtn.textContent = "Copied";
        setTimeout(function () { copyBtn.textContent = "Copy address"; }, 1500);
      }).catch(function () {});
    });
  }
  var sub = document.getElementById("pay-submit-txid");
  if (sub) {
    sub.addEventListener("click", async function () {
      var msg = document.getElementById("pay-msg");
      var txid = (document.getElementById("pay-txid") && document.getElementById("pay-txid").value || "").trim();
      var pay = window.__parokhPayment || {};
      var orderId = pay.order_id || (document.getElementById("pay-order-id") && document.getElementById("pay-order-id").textContent);
      if (msg) { msg.hidden = false; msg.style.color = "#f87171"; }
      if (!txid || txid.length < 60) {
        if (msg) msg.textContent = "Invalid TXID";
        return;
      }
      try {
        var headers = await parokhAuthHeaders();
        var r = await fetch("/api/payment/submit-txid", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ orderId: orderId, txid: txid })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(d.error || "submit_failed");
        var st = (d.payment && d.payment.status) || "";
        if (msg) {
          msg.style.color = st === "PAID" ? "#4ade80" : "#fbbf24";
          msg.textContent = "Status: " + st + (d.payment && d.payment.verification_reason ? " (" + d.payment.verification_reason + ")" : "");
        }
        if (d.payment) showPaymentPanel(Object.assign({}, pay, d.payment));
      } catch (e) {
        if (msg) msg.textContent = String(e.message || e);
      }
    });
  }
  var ver = document.getElementById("pay-verify-btn");
  if (ver) {
    ver.addEventListener("click", async function () {
      var msg = document.getElementById("pay-msg");
      var pay = window.__parokhPayment || {};
      try {
        var headers = await parokhAuthHeaders();
        var r = await fetch("/api/payment/verify", {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ paymentId: pay.payment_id, orderId: pay.order_id })
        });
        var d = await r.json();
        if (!r.ok) throw new Error(d.error || "verify_failed");
        if (msg) {
          msg.hidden = false;
          msg.style.color = d.payment && d.payment.status === "PAID" ? "#4ade80" : "#fbbf24";
          msg.textContent = "Status: " + (d.payment && d.payment.status) + (d.payment && d.payment.verification_reason ? " (" + d.payment.verification_reason + ")" : "");
        }
        if (d.payment) showPaymentPanel(Object.assign({}, pay, d.payment));
      } catch (e) {
        if (msg) { msg.hidden = false; msg.style.color = "#f87171"; msg.textContent = String(e.message || e); }
      }
    });
  }
});
