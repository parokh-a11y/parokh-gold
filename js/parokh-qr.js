/*! ParokhQR — thin wrapper; uses QRCode lib if present, else canvas fallback text */
window.ParokhQR = {
  render: function(el, text, size) {
    size = size || 180;
    if (!el) return;
    el.innerHTML = "";
    var box = document.createElement("div");
    box.style.width = size + "px";
    box.style.height = size + "px";
    el.appendChild(box);
    if (typeof QRCode !== "undefined") {
      try {
        new QRCode(box, { text: String(text), width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
        return;
      } catch (e) {}
    }
    // fallback: draw simple label (address still copyable)
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.border = "1px solid rgba(212,175,55,.3)";
    box.style.borderRadius = "12px";
    box.style.padding = "8px";
    box.style.fontSize = "10px";
    box.style.wordBreak = "break-all";
    box.style.color = "#d4af37";
    box.textContent = String(text);
  }
};
