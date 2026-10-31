window.ParokhQR = {
  render: function (el, text, size) {
    size = size || 180;
    if (!el) return;
    el.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      try {
        new QRCode(el, { text: String(text), width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
        return;
      } catch (e) {}
    }
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.padding = "8px";
    el.style.fontSize = "10px";
    el.style.wordBreak = "break-all";
    el.style.color = "#d4af37";
    el.textContent = String(text);
  }
};
