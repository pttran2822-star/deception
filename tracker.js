/* tracker.js — dùng chung cho trang chủ, các bài đọc và trang lịch sử.
   - Đăng nhập bằng ID + PIN (PIN được băm SHA-256 ngay trên trình duyệt, không gửi PIN thật).
   - Lưu mỗi lượt làm bài lên Google Sheet qua Apps Script (khi có API_URL), hoặc vào thiết bị (chế độ thử).
   Cách dùng trong một bài đọc:
     Tracker.mountBar();                        // thanh trên cùng: Trang chủ / Lịch sử / Đăng nhập
     const aid = Tracker.uid();                 // mã của một lượt làm; dùng lại aid thì ghi đè lượt đó
     Tracker.submit({aid, passage, title, score, total, seconds, detail, extra}).then(r => Tracker.showStatus(el, r));
*/
(function () {
  "use strict";
  var CFG = window.RD_CONFIG || {};
  var KEY = "rd_user", LOC = "rd_local_";
  var ls = {
    g: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    s: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    d: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var T = window.Tracker = {};
  var mem = null, pend = null, subs = [];
  var err = function (c) { var e = new Error(c); e.code = c; return e; };

  T.mode = function () { return CFG.API_URL ? "cloud" : "local"; };
  T.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  T.user = function () {
    if (!mem) { try { var u = JSON.parse(ls.g(KEY) || "null"); if (u && u.id && u.hash) mem = u; } catch (e) {} }
    return mem;
  };
  T.onChange = function (f) { subs.push(f); };
  function emit() { subs.forEach(function (f) { try { f(T.user()); } catch (e) {} }); }

  /* Tạo phần tử DOM nhanh, luôn dùng textContent nên an toàn với dữ liệu người dùng. */
  T.h = function (tag, attrs) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    var add = function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    };
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  };
  var h = T.h;

  async function sha(id, pin) {
    if (!(window.crypto && crypto.subtle)) throw err("INSECURE");
    var d = new TextEncoder().encode("rd1|" + id.toLowerCase() + "|" + pin);
    var b = await crypto.subtle.digest("SHA-256", d);
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }

  async function call(p) {
    var j;
    try {
      var r = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(p) });
      j = await r.json();
    } catch (e) { throw err("NETWORK"); }
    if (!j || !j.ok) throw err((j && j.error) || "ERROR");
    return j;
  }

  function lkey(u) { return LOC + u.id.toLowerCase(); }
  function lread(u) { try { return JSON.parse(ls.g(lkey(u)) || "[]"); } catch (e) { return []; } }

  T.login = async function (id, pin) {
    id = String(id || "").trim(); pin = String(pin || "");
    if (id.length < 2 || id.length > 24 || /^[=+\-@]/.test(id)) throw err("BAD_ID");
    if (pin.length < 4 || pin.length > 32) throw err("BAD_PIN_FORMAT");
    var hash = await sha(id, pin), created = false, name = id;
    if (T.mode() === "cloud") {
      var r = await call({ action: "login", id: id, hash: hash });
      created = !!r.created; name = r.name || id;
    }
    mem = { id: name, hash: hash };
    ls.s(KEY, JSON.stringify(mem));
    emit();
    return { created: created };
  };
  T.logout = function () { mem = null; ls.d(KEY); emit(); };

  T.submit = async function (a) {
    var u = T.user();
    if (!u) { pend = { a: a, host: null }; return { saved: false, reason: "NOLOGIN" }; }
    pend = null;
    if (T.mode() === "local") {
      var L = lread(u), i = -1;
      for (var k = 0; k < L.length; k++) if (L[k].aid === a.aid) { i = k; break; }
      var rec = Object.assign({ t: i >= 0 ? L[i].t : new Date().toISOString() }, a);
      if (i >= 0) L[i] = rec; else L.push(rec);
      ls.s(lkey(u), JSON.stringify(L));
      return { saved: true, mode: "local" };
    }
    try {
      await call({ action: "submit", id: u.id, hash: u.hash, attempt: a });
      return { saved: true, mode: "cloud" };
    } catch (e) {
      if (e.code === "BAD_PIN" || e.code === "NO_USER") T.logout();
      return { saved: false, reason: e.code || "ERROR" };
    }
  };

  T.history = async function () {
    var u = T.user();
    if (!u) return null;
    if (T.mode() === "local") return lread(u);
    try {
      var r = await call({ action: "history", id: u.id, hash: u.hash });
      return r.attempts || [];
    } catch (e) {
      if (e.code === "BAD_PIN" || e.code === "NO_USER") T.logout();
      throw e;
    }
  };

  /* Đăng nhập xong thì tự lưu lượt làm bài đang chờ (nếu có). */
  T.onChange(function (u) {
    if (u && pend) {
      var p = pend; pend = null;
      T.submit(p.a).then(function (r) { if (p.host) T.showStatus(p.host, r); });
    }
  });

  var MSG = {
    BAD_ID: "ID cần 2–24 ký tự và không bắt đầu bằng = + - @.",
    BAD_PIN_FORMAT: "PIN cần 4–32 ký tự.",
    BAD_PIN: "Sai PIN cho ID này.",
    NO_USER: "Phiên đăng nhập không còn hợp lệ, hãy đăng nhập lại.",
    NETWORK: "Không kết nối được máy chủ lưu dữ liệu. Thử lại sau.",
    INSECURE: "Trang cần được mở qua địa chỉ https://.",
    ERROR: "Có lỗi xảy ra, thử lại sau."
  };
  T.msg = function (code) { return MSG[code] || MSG.ERROR; };

  T.showStatus = function (host, r) {
    var n = host.querySelector(".rdsave");
    if (!n) { n = h("div", { class: "rdsave" }); n.style.cssText = "margin-top:10px;font-size:14px"; host.appendChild(n); }
    n.textContent = "";
    if (r.saved) {
      n.textContent = "✓ Đã lưu vào lịch sử" + (r.mode === "local" ? " (chỉ trên thiết bị này)." : ".");
    } else if (r.reason === "NOLOGIN") {
      if (pend) pend.host = host;
      n.appendChild(document.createTextNode("Chưa đăng nhập nên kết quả chưa được lưu. "));
      n.appendChild(h("button", { type: "button", text: "Đăng nhập để lưu", onclick: function () { T.openLogin(); } }));
    } else {
      n.textContent = "Chưa lưu được kết quả: " + T.msg(r.reason);
    }
  };

  /* ---------- Giao diện: thanh trên cùng + hộp đăng nhập ---------- */
  var CSS = "#rdbar{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;font:500 14px/1.4 'Be Vietnam Pro',system-ui,sans-serif;background:#3a2a1a;color:#f6ecd4;padding:8px 14px;border-radius:10px;margin:0 0 12px;border:1px solid rgba(240,217,160,.35)}" +
    "#rdbar a{color:#f0d9a0;text-decoration:none;font-weight:600}#rdbar a:hover{text-decoration:underline}" +
    "#rdbar .sp{flex:1 1 auto}#rdbar .rdm{font-size:12px;background:#b98a2e;color:#2a1d0a;border-radius:10px;padding:1px 9px}" +
    "#rdbar button,.rdsave button{font:inherit;cursor:pointer;border-radius:16px;border:1px solid #f0d9a0;background:transparent;color:#f0d9a0;padding:3px 14px}" +
    ".rdsave button{border-color:#7a4a1e;color:#7a4a1e;margin-left:4px}" +
    "#rdbar button:hover{background:#f0d9a0;color:#2a1d0a}.rdsave button:hover{background:#7a4a1e;color:#fff}" +
    "#rddlg{border:0;border-radius:14px;padding:22px 24px;max-width:min(420px,92vw);background:#fbf4e3;color:#35271b;font:400 15px/1.5 'Be Vietnam Pro',system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}" +
    "#rddlg::backdrop{background:rgba(20,12,4,.55)}#rddlg h3{margin:0 0 6px;font:700 26px 'Cormorant Garamond',serif}" +
    "#rddlg p{margin:0 0 12px;font-size:13.5px;color:#6b5238}#rddlg label{display:block;font-weight:600;margin:10px 0 4px}" +
    "#rddlg input{width:100%;font:inherit;padding:8px 10px;border:1px solid #b9a37a;border-radius:8px;background:#fff;color:#35271b}" +
    "#rddlg input:focus-visible{outline:3px solid #b98a2e;outline-offset:1px}#rddlg .rdmsg{min-height:1.4em;color:#b33a3a;font-size:14px;margin-top:8px}" +
    "#rddlg .row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}" +
    "#rddlg button{font:inherit;font-weight:600;padding:8px 18px;border-radius:20px;border:1px solid #7a4a1e;cursor:pointer;background:#fbf4e3;color:#7a4a1e}" +
    "#rddlg button.go{background:#7a4a1e;color:#fff}#rddlg button:disabled{opacity:.6;cursor:wait}";
  var cssDone = false;
  function injectCss() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
  }

  T.mountBar = function (opts) {
    opts = opts || {};
    injectCss();
    var el = document.getElementById("rdbar");
    if (!el) { el = document.createElement("div"); el.id = "rdbar"; document.body.insertBefore(el, document.body.firstChild); }
    function render() {
      el.textContent = "";
      if (opts.home !== false) el.appendChild(h("a", { href: "index.html", text: "← Trang chủ" }));
      if (opts.history !== false) el.appendChild(h("a", { href: "history.html", text: "📈 Lịch sử" }));
      el.appendChild(h("span", { class: "sp" }));
      if (T.mode() === "local") el.appendChild(h("span", { class: "rdm", title: "Chưa kết nối máy chủ: lịch sử chỉ lưu trên thiết bị này", text: "Chế độ thử" }));
      var u = T.user();
      if (u) {
        el.appendChild(h("span", { text: "👤 " + u.id }));
        el.appendChild(h("button", { type: "button", text: "Đăng xuất", onclick: function () { T.logout(); } }));
      } else {
        el.appendChild(h("button", { type: "button", text: "Đăng nhập", onclick: function () { T.openLogin(); } }));
      }
    }
    render();
    T.onChange(render);
  };

  T.openLogin = function () {
    injectCss();
    var d = document.getElementById("rddlg");
    if (!d) {
      var id = h("input", { id: "rdid", name: "id", autocomplete: "username", maxlength: "24", required: true });
      var pin = h("input", { id: "rdpin", name: "pin", type: "password", autocomplete: "current-password", maxlength: "32", required: true });
      var msg = h("div", { class: "rdmsg", role: "alert" });
      var go = h("button", { type: "submit", class: "go", text: "Đăng nhập" });
      var cancel = h("button", { type: "button", text: "Đóng", onclick: function () { close(); } });
      var form = h("form", { method: "dialog" },
        h("h3", { text: "Đăng nhập" }),
        h("p", { text: "ID mới: PIN bạn nhập lần đầu sẽ trở thành PIN của ID đó, hãy nhớ nó. ID đã có: nhập đúng PIN đã đặt." }),
        h("label", { for: "rdid", text: "ID (tên bạn dùng)" }), id,
        h("label", { for: "rdpin", text: "PIN (4–32 ký tự)" }), pin,
        msg, h("div", { class: "row" }, cancel, go));
      d = h("dialog", { id: "rddlg" }, form);
      document.body.appendChild(d);
      var close = function () { if (d.close) d.close(); else d.removeAttribute("open"); };
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        msg.textContent = ""; go.disabled = true;
        try {
          await T.login(id.value, pin.value);
          pin.value = ""; close();
        } catch (e) { msg.textContent = T.msg(e.code); }
        go.disabled = false;
      });
    }
    d.querySelector(".rdmsg").textContent = "";
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    setTimeout(function () { var f = d.querySelector("#rdid"); if (f) f.focus(); }, 30);
  };
})();
