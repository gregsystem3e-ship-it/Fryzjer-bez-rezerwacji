/*
 * Lokalna baza danych dla wersji demonstracyjnej.
 *
 * Aplikacja (app.js) zapisuje dane przez interfejs `claude.use("db")`.
 * Na platformie Claude ten interfejs dostarcza wspólna baza. Na własnej stronie
 * (np. GitHub Pages) tego pliku używamy zamiast niej: dane trafiają do localStorage
 * tej przeglądarki, a otwarte karty tej samej przeglądarki widzą zmiany na bieżąco.
 *
 * Telefon i komputer NIE są ze sobą połączone. Żeby połączyć salony i klientów,
 * trzeba w tym miejscu podłączyć prawdziwą bazę (np. Supabase lub Firebase) i zachować
 * ten sam interfejs: doc(), collection(), get, set, update, delete, acquire, onSnapshot.
 */
(function () {
  if (window.claude && window.claude.use) return; // wewnątrz platformy Claude działa jej własna baza

  var KEY = "flm_db_v1", mem = null, subs = [], ready;

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromMin(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function toMin(t) { var p = t.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function merge(a, b) { var o = Object.assign({}, a); Object.keys(b).forEach(function (k) { o[k] = isObj(b[k]) && isObj(o[k]) ? merge(o[k], b[k]) : b[k]; }); return o; }
  function newId() { var s = ""; for (var i = 0; i < 16; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36)); return s; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function sha(s) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(hex); }

  function readAll() {
    if (mem) return mem;
    try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : {}; } catch (e) { mem = {}; return mem; }
  }
  function writeAll(m) {
    if (mem) { mem = m; return; }
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { mem = m; }
  }
  function withLock(fn) {
    try { if (navigator.locks && navigator.locks.request) return navigator.locks.request("flm_db", fn); } catch (e) {}
    return Promise.resolve().then(fn);
  }

  function colDocs(m, col) {
    var out = [];
    Object.keys(m).forEach(function (p) { var s = p.split("/"); if (s.length === 2 && s[0] === col) out.push({ id: s[1], data: m[p].data }); });
    out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return out;
  }
  function match(d, filters) {
    return filters.every(function (f) {
      var v = d.data[f[0]], x = f[2];
      switch (f[1]) {
        case "==": return v === x; case "!=": return v !== x; case "<": return v < x;
        case "<=": return v <= x; case ">": return v > x; case ">=": return v >= x; default: return false;
      }
    });
  }
  function mkDoc(id, data) {
    var c = clone(data);
    return { id: id, exists: true, data: function () { return clone(c); }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function missing(id) { return { id: id, exists: false, data: function () { return undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function notify() { subs.slice().forEach(function (s) { s.fire(); }); }
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === null) notify(); });

  function write(fn) {
    return ready.then(function () {
      return withLock(function () { var m = readAll(); fn(m); writeAll(m); notify(); });
    });
  }
  function ref(path) {
    var id = path.split("/").pop();
    return {
      id: id, path: path,
      get: function () { return ready.then(function () { var v = readAll()[path]; return v ? mkDoc(id, v.data) : missing(id); }); },
      set: function (data) { return write(function (m) { var v = m[path]; m[path] = { data: clone(data), version: (v ? v.version : 0) + 1, lease: v ? v.lease : null }; }); },
      update: function (data) {
        return write(function (m) {
          var v = m[path];
          if (!v) { var e = new Error("update requires an existing document"); e.code = "invalid_argument"; throw e; }
          v.data = merge(v.data, clone(data)); v.version++;
        });
      },
      delete: function () { return write(function (m) { delete m[path]; }); },
      acquire: function (o) {
        return ready.then(function () {
          return withLock(function () {
            var m = readAll(), v = m[path], now = Date.now();
            if (!v) return { acquired: true, holder: o.holder };
            if (v.lease && v.lease.exp > now && v.lease.holder !== o.holder) return { acquired: false, expiresAt: new Date(v.lease.exp).toISOString() };
            v.lease = { holder: o.holder, exp: now + Math.min(Math.max(o.ttlMs || 30000, 1000), 600000) };
            writeAll(m);
            return { acquired: true, version: v.version, holder: o.holder, expiresAt: new Date(v.lease.exp).toISOString() };
          });
        });
      }
    };
  }

  function query(col, filters, lim) {
    return {
      where: function (f, o, v) { return query(col, filters.concat([[f, o, v]]), lim); },
      limit: function (n) { return query(col, filters, n); },
      get: function () {
        return ready.then(function () {
          var docs = colDocs(readAll(), col).filter(function (d) { return match(d, filters); });
          if (lim) docs = docs.slice(0, lim);
          var ds = docs.map(function (d) { return mkDoc(d.id, d.data); });
          return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false } };
        });
      },
      onSnapshot: function (next) {
        var prev = new Map(), sig = null, dead = false;
        var s = {
          fire: function () {
            if (dead) return;
            ready.then(function () {
              if (dead) return;
              var docs = colDocs(readAll(), col).filter(function (d) { return match(d, filters); });
              if (lim) docs = docs.slice(0, lim);
              var cs = JSON.stringify(docs); if (cs === sig) return; sig = cs;
              var cur = new Map(docs.map(function (d) { return [d.id, d]; })), ch = [];
              docs.forEach(function (d) {
                var p = prev.get(d.id);
                if (!p) ch.push({ type: "added", doc: mkDoc(d.id, d.data) });
                else if (JSON.stringify(p.data) !== JSON.stringify(d.data)) ch.push({ type: "modified", doc: mkDoc(d.id, d.data) });
              });
              prev.forEach(function (p, id) { if (!cur.has(id)) ch.push({ type: "removed", doc: mkDoc(id, p.data) }); });
              prev = cur;
              var ds = docs.map(function (d) { return mkDoc(d.id, d.data); });
              next({ docs: ds, size: ds.length, empty: !ds.length, docChanges: function () { return ch; }, metadata: { fromCache: false, hasPendingWrites: false } });
            });
          }
        };
        subs.push(s); s.fire();
        return function () { dead = true; subs = subs.filter(function (x) { return x !== s; }); };
      }
    };
  }

  var db = {
    doc: function (p) { return ref(p); },
    collection: function (c) {
      var q = query(c, [], null);
      q.doc = function (id) { return ref(c + "/" + (id || newId())); };
      q.add = function (data) { var r = ref(c + "/" + newId()); return r.set(data).then(function () { return r; }); };
      return q;
    }
  };

  /* ---------- dane demonstracyjne (wymyślone salony) ---------- */
  var H = function (a) { return a; };
  var SD = [
    { id: "salon-nozyce", name: "Salon Nożyce", address: "ul. Piotrkowska 12", phone: "500 111 222", place: "centrum", lat: 51.0690, lng: 19.4478,
      desc: "Mały salon z 15-letnią tradycją. Strzyżenie damskie i męskie, koloryzacja. Pracuję sam, więc każdy klient ma czas dla siebie.",
      hours: [["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "18:00"], ["09:00", "19:00"], ["09:00", "17:00"], ["08:00", "13:00"], null],
      svc: [["n1", "Strzyżenie damskie", 60, 90], ["n2", "Strzyżenie męskie", 30, 50], ["n3", "Koloryzacja", 120, 180], ["n4", "Broda", 20, 30]],
      plan: [[0, 30, 0, 70], [1, "10:00", 0, 70], [1, "12:30", 2, 150], [2, "11:00", 3, null]] },
    { id: "barber-cien", name: "Barber Cień", address: "ul. Kopernika 4", phone: "500 333 444", place: "centrum", lat: 51.0655, lng: 19.4420,
      desc: "Barber shop dla panów. Klasyczne strzyżenie, golenie brzytwą, stylizacja brody.",
      hours: [["10:00", "19:00"], ["10:00", "19:00"], ["10:00", "19:00"], ["10:00", "20:00"], ["10:00", "20:00"], ["09:00", "15:00"], null],
      svc: [["c1", "Strzyżenie męskie", 30, 60], ["c2", "Strzyżenie + broda", 50, 80], ["c3", "Broda", 20, 30]],
      plan: [[0, 0, 0, 45], [0, 60, 1, null], [1, "09:30", 0, null], [1, "13:30", 1, 65]] },
    { id: "studio-kontur", name: "Studio Kontur", address: "ul. Słoneczna 7", phone: "500 555 666", place: "polnoc", lat: 51.0745, lng: 19.4550,
      desc: "Koloryzacja, balayage, pielęgnacja włosów. Pracuję na profesjonalnych kosmetykach.",
      hours: [["09:00", "17:00"], ["09:00", "17:00"], ["09:00", "17:00"], ["09:00", "17:00"], ["09:00", "16:00"], null, null],
      svc: [["k1", "Balayage", 180, 350], ["k2", "Koloryzacja", 120, 180], ["k3", "Strzyżenie damskie", 60, 100]],
      plan: [[0, 90, 1, 140], [1, "09:00", 2, 80], [1, "14:00", 0, 299]] },
    { id: "fryzjer-pod-lipa", name: "Fryzjer Pod Lipą", address: "ul. Lipowa 21", phone: "500 777 888", place: "poludnie", lat: 51.0580, lng: 19.4600,
      desc: "Rodzinny zakład fryzjerski na osiedlu. Strzyżenie dzieci, panów i pań.",
      hours: [["08:00", "16:00"], ["08:00", "16:00"], ["08:00", "16:00"], ["08:00", "18:00"], ["08:00", "16:00"], ["08:00", "12:00"], null],
      svc: [["l1", "Strzyżenie dziecięce", 30, 35], ["l2", "Strzyżenie damskie", 60, 70], ["l3", "Strzyżenie męskie", 30, 40]],
      plan: [[1, "08:30", 0, null], [1, "11:00", 1, 55], [2, "10:00", 2, 30]] }
  ];

  function seedSlots(m) {
    var today = ymd(0), keys = Object.keys(m).filter(function (k) { return k.indexOf("slots/seed-") === 0; });
    if (keys.some(function (k) { return m[k].data.date >= today; })) return false;
    keys.forEach(function (k) { delete m[k]; });
    var now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), base = Math.ceil((nm + 45) / 30) * 30, n = 1;
    SD.forEach(function (s) {
      s.plan.forEach(function (p) {
        var t = typeof p[1] === "number" ? base + p[1] : toMin(p[1]);
        if (p[0] === 0 && t > 19 * 60 + 30) return;
        var sv = s.svc[p[2]];
        m["slots/seed-" + pad(n++)] = { data: { salonId: s.id, date: ymd(p[0]), time: fromMin(t), dur: sv[2], service: sv[1], price: sv[3], promo: p[3], booked: null }, version: 1, lease: null };
      });
    });
    return true;
  }
  function mapUrl(a) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a + ", Radomsko"); }

  function seed() {
    var m = readAll();
    var has = Object.keys(m).some(function (k) { return k.indexOf("salons/") === 0; });
    if (has) { if (seedSlots(m)) writeAll(m); return Promise.resolve(); }
    return Promise.all(SD.map(function (s, i) {
      var salt = "seed" + i + "a1b2c3d4e5f6";
      return sha(salt + ":demo123").catch(function () { return ""; }).then(function (h) { return [s, salt, h]; });
    })).then(function (arr) {
      var m2 = readAll();
      arr.forEach(function (a) {
        var s = a[0];
        m2["salons/" + s.id] = { version: 1, lease: null, data: { name: s.name, nameKey: s.name.toLowerCase(), address: s.address, phone: s.phone, desc: s.desc, mapUrl: mapUrl(s.address),
          placeKey: s.place, lat: s.lat, lng: s.lng, seenAt: 0,
          hours: s.hours.map(function (h) { return { closed: !h, from: h ? h[0] : "09:00", to: h ? h[1] : "17:00" }; }),
          services: s.svc.map(function (x) { return { id: x[0], name: x[1], dur: x[2], price: x[3] }; }) } };
        m2["auth/" + s.id] = { version: 1, lease: null, data: { salt: a[1], hash: a[2] } };
      });
      seedSlots(m2);
      writeAll(m2);
    });
  }
  ready = withLock(seed);

  window.claude = { use: function (name) { return Promise.resolve(name === "db" ? db : null); } };

  /* ---------- informacja i reset w interfejsie ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var wrap = document.querySelector(".wrap"), banner = document.getElementById("banner");
    if (!wrap) return;
    var note = document.createElement("div");
    note.className = "note";
    note.textContent = "Wersja demonstracyjna: dane zapisują się tylko w tej przeglądarce, na tym urządzeniu. Telefon i komputer nie są ze sobą połączone.";
    wrap.insertBefore(note, banner || null);
    var foot = document.createElement("div");
    foot.style.cssText = "margin-top:28px;text-align:center";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "link"; btn.textContent = "Zresetuj dane demo";
    var armed = false, timer;
    btn.addEventListener("click", function () {
      if (!armed) { armed = true; btn.textContent = "Na pewno? Kliknij jeszcze raz, żeby usunąć wszystkie dane"; timer = setTimeout(function () { armed = false; btn.textContent = "Zresetuj dane demo"; }, 5000); return; }
      clearTimeout(timer);
      try { localStorage.removeItem(KEY); } catch (e) {}
      mem = null; location.reload();
    });
    foot.appendChild(btn); wrap.appendChild(foot);
  });
})();
