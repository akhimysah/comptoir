/* Équivalent de l'asset global Shopify vendor/qrcode.js (API qrcodejs) : le QR code est dessiné par /api/qr. */
(function () {
  function QRCode(el, options) {
    if (typeof el === "string") el = document.getElementById(el);
    this._el = el;
    this._opts = typeof options === "string" ? { text: options } : options || {};
    if (this._opts.text) this.makeCode(this._opts.text);
  }
  QRCode.prototype.makeCode = function (text) {
    var o = this._opts, w = o.width || 256, h = o.height || w;
    var q = "/api/qr?t=" + encodeURIComponent(text) + "&s=" + w + "&d=" + encodeURIComponent(o.colorDark || "#000000") + "&l=" + encodeURIComponent(o.colorLight || "#ffffff");
    this.clear();
    var img = document.createElement("img");
    img.src = q; img.width = w; img.height = h; img.alt = ""; img.style.display = "block";
    if (this._el) { this._el.appendChild(img); this._el.title = text; }
  };
  QRCode.prototype.clear = function () { if (this._el) while (this._el.firstChild) this._el.removeChild(this._el.firstChild); };
  QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  window.QRCode = QRCode;
})();
