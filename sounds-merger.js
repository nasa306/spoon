(function () {
  "use strict";
  var MANIFEST = {
  "size": 34562788,
  "sha256": "f55e2b9338bebf0be2c753a83d38cc697f7f3e312ddfee284dd001d508eb58a5",
  "parts": [
    {
      "url": "5a.bin",
      "size": 17281394,
      "sha256": "4681990c61a2ba72a42d9f1dc30bba7c96fb058ac06f7d994fec69aa49009a9a"
    },
    {
      "url": "5b.bin",
      "size": 17281394,
      "sha256": "1ce7cba036d8a4f7cb1477b29d70997224b9e3b783b48c5ff551dd046fb3234b"
    }
  ]
};
  var started = false;

  function status(msg) {
    try {
      var el = document.getElementById("boot_status");
      if (el) el.textContent = msg;
    } catch (e) {}
  }

  function hex(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  async function sha256(buf) {
    if (!(window.crypto && crypto.subtle)) return null; // insecure context
    return hex(await crypto.subtle.digest("SHA-256", buf));
  }

  async function fetchPart(part, attempt) {
    try {
      var resp = await fetch(part.url + "?v=" + part.sha256.slice(0, 12), { cache: "force-cache" });
      if (!resp.ok) throw new Error(part.url + " HTTP " + resp.status);
      var buf = await resp.arrayBuffer();
      if (buf.byteLength !== part.size)
        throw new Error(part.url + " size " + buf.byteLength + " != " + part.size);
      var h = await sha256(buf);
      if (h !== null && h !== part.sha256)
        throw new Error(part.url + " SHA-256 mismatch");
      return buf;
    } catch (e) {
      if (attempt < 3) return fetchPart(part, attempt + 1);
      throw e;
    }
  }
  function b64ToBytes(src, expected) {
    var lut = new Int16Array(256).fill(-1);
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (var i = 0; i < 64; i++) lut[chars.charCodeAt(i)] = i;
    var out = new Uint8Array(expected);
    var o = 0, acc = 0, bits = 0;
    for (var j = 0; j < src.length; j++) {
      var c = src[j];
      if (c === 61) { acc = 0; bits = 0; continue; } // '=' ends a line's group
      var v = lut[c];
      if (v < 0) continue;                           // skip newlines/whitespace
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        if (o < expected) out[o] = (acc >> bits) & 255;
        o++;
        acc &= (1 << bits) - 1;
      }
    }
    if (o !== expected) throw new Error("decoded size " + o + " != " + expected);
    return out.buffer;
  }
  async function run() {
    if (started) throw new Error("sounds merge already started");
    started = true;
    status("Downloading sound data (2 parts)...");
    var bufs = await Promise.all(MANIFEST.parts.map(function (p) { return fetchPart(p, 1); }));

    var total = 0;
    for (var i = 0; i < bufs.length; i++) total += bufs[i].byteLength;
    if (total !== MANIFEST.size)
      throw new Error("merged size " + total + " != expected " + MANIFEST.size);

    var out = new Uint8Array(total), off = 0;
    for (var j = 0; j < bufs.length; j++) { // order is fixed by the manifest
      out.set(new Uint8Array(bufs[j]), off);
      off += bufs[j].byteLength;
      bufs[j] = null;
    }
    var h = await sha256(out.buffer);
    if (h !== null && h !== MANIFEST.sha256)
      throw new Error("merged SHA-256 mismatch");

    status("Sound data verified.");
    return b64ToBytes(out, 25921893);
  }
  
  window.__eagSoundsMerged = run();
  window.__eagSoundsMerged.catch(function (e) {
    console.error("[sounds-merger] FAILED: " + e.message);
    status("Failed to load sound data: " + e.message);
  });
})();
