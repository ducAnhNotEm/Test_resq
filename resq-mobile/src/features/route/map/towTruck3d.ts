// towTruck3d.ts: BẢN SAO NGUYÊN VĂN của server/admin/towtruck3d.js — xe tải cứu hộ 3D (Three.js) cho bản đồ trong WebView.
// Đừng sửa tay file này: sửa server/admin/towtruck3d.js rồi chạy  node resq-mobile/scripts/sync-truck3d.mjs
// (test tests/truck3d.test.ts báo lỗi nếu hai bản lệch nhau).
export const TOW_TRUCK_3D_JS = String.raw`/* towtruck3d.js — XE TẢI CỨU HỘ 3D (Three.js) chạy trên bản đồ Goong / Mapbox GL v1 (custom layer).
 * DÙNG CHUNG: trang admin (file này) + app (resq-mobile/src/features/route/map/towTruck3d.ts — bản sao, có test bảo
 * đảm hai bản giống hệt). KHÔNG dùng dấu backtick hay "dollar + ngoặc nhọn" trong file: app nhúng nguyên văn vào chuỗi template.
 *
 * Mô hình dựng hoàn toàn bằng code (không tải file .glb): cabin đỏ ResQ, kính, logo "ResQ" ở cửa, sàn trượt thép,
 * tời kéo, sọc vàng đen phía sau, 6 bánh, đèn pha / đèn hậu, đèn ưu tiên màu hổ phách nhấp nháy trên nóc.
 * Kích thước tự phóng theo mức zoom để xe luôn rõ (~64 px chiều dài), không bao giờ nhỏ hơn kích thước thật.
 *
 * API:  var t = ResQTruck3D.attach(map, goongjs, THREE, { px: 64, id: 'resq-truck3d', onError: fn })  → null nếu
 *       trình duyệt / thư viện không hỗ trợ (người gọi dùng biểu tượng 2D).
 *       t.setPose(id, [lng, lat], headingDeg, tone, glideMs)   tone: 'normal' | 'alert' | 'muted'
 *       t.remove(id)   t.clear()   t.failed() → true nếu WebGL lỗi lúc chạy (người gọi chuyển sang 2D)
 */
(function (root) {
  'use strict';
  var LEN = 7.4;                                   // chiều dài xe thật (m)
  var TONE = { normal: 0x2563eb, alert: 0xef4444, muted: 0x64748b };

  function mat(THREE, color, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      color: color, roughness: o.r == null ? 0.55 : o.r, metalness: o.m == null ? 0.15 : o.m,
      emissive: o.e == null ? 0x000000 : o.e, emissiveIntensity: o.ei == null ? 1 : o.ei,
      transparent: !!o.t, opacity: o.o == null ? 1 : o.o, side: o.ds ? THREE.DoubleSide : THREE.FrontSide
    });
  }
  function box(THREE, w, h, l, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    m.position.set(x, y, z);
    return m;
  }
  function canvasTex(THREE, w, h, paint) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function doorDecal(THREE) {
    return canvasTex(THREE, 256, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'italic 900 62px Arial, sans-serif';
      g.fillText('ResQ', w / 2, h * 0.42);
      g.font = '700 22px Arial, sans-serif';
      g.fillText('CỨU HỘ 24/7', w / 2, h * 0.82);
    });
  }
  function hazardStripes(THREE) {
    return canvasTex(THREE, 256, 32, function (g, w, h) {
      g.fillStyle = '#111111'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f5b400';
      for (var x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
    });
  }

  /** Dựng xe: trục dọc = Z, đầu xe hướng về -Z, mặt đất y = 0. Trả về nhóm + vật liệu đèn để nhấp nháy. */
  function buildTruck(THREE) {
    var g = new THREE.Group();
    var RED = mat(THREE, 0xd91424, { r: 0.32, m: 0.3 });
    var RED_DARK = mat(THREE, 0x9f1220, { r: 0.4, m: 0.25 });
    var DARK = mat(THREE, 0x1f2937, { r: 0.75 });
    var STEEL = mat(THREE, 0xc9d1db, { r: 0.3, m: 0.75 });
    var GLASS = mat(THREE, 0x16263d, { r: 0.08, m: 0.7 });
    var TIRE = mat(THREE, 0x111111, { r: 0.95 });
    var HUB = mat(THREE, 0xa3aab4, { r: 0.25, m: 0.85 });
    var HEAD = mat(THREE, 0xfff8e1, { e: 0xfff3c4, ei: 1.4 });
    var TAIL = mat(THREE, 0x7f0000, { e: 0xff1a1a, ei: 1.2 });
    var B1 = mat(THREE, 0xffb000, { e: 0xffa000, ei: 2, r: 0.2 });
    var B2 = mat(THREE, 0xffb000, { e: 0xffa000, ei: 0.15, r: 0.2 });

    // khung gầm
    g.add(box(THREE, 2.2, 0.35, 7.0, DARK, 0, 0.72, 0.05));
    // cabin + nóc vát
    g.add(box(THREE, 2.4, 1.6, 2.2, RED, 0, 1.75, -2.6));
    g.add(box(THREE, 2.34, 0.45, 1.7, RED, 0, 2.77, -2.4));
    g.add(box(THREE, 2.42, 0.32, 2.24, RED_DARK, 0, 1.05, -2.6));          // viền thân dưới
    // kính chắn gió + kính bên
    g.add(box(THREE, 2.16, 0.78, 0.06, GLASS, 0, 2.35, -3.72));
    g.add(box(THREE, 0.05, 0.62, 1.05, GLASS, 1.205, 2.33, -2.95));
    g.add(box(THREE, 0.05, 0.62, 1.05, GLASS, -1.205, 2.33, -2.95));
    // lưới tản nhiệt, cản trước, đèn pha
    g.add(box(THREE, 1.3, 0.5, 0.05, DARK, 0, 1.38, -3.73));
    g.add(box(THREE, 2.5, 0.32, 0.28, DARK, 0, 0.82, -3.74));
    g.add(box(THREE, 0.38, 0.2, 0.05, HEAD, 0.86, 1.32, -3.74));
    g.add(box(THREE, 0.38, 0.2, 0.05, HEAD, -0.86, 1.32, -3.74));
    // logo ResQ hai bên cửa
    var decal = new THREE.MeshBasicMaterial({ map: doorDecal(THREE), transparent: true });
    var dl = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.58), decal);
    dl.position.set(1.212, 1.6, -2.45); dl.rotation.y = Math.PI / 2; g.add(dl);
    var dr = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.58), decal);
    dr.position.set(-1.212, 1.6, -2.45); dr.rotation.y = -Math.PI / 2; g.add(dr);
    // đèn ưu tiên trên nóc
    g.add(box(THREE, 1.7, 0.1, 0.36, DARK, 0, 3.04, -2.45));
    var b1 = box(THREE, 0.62, 0.2, 0.32, B1, 0.46, 3.18, -2.45);
    var b2 = box(THREE, 0.62, 0.2, 0.32, B2, -0.46, 3.18, -2.45);
    g.add(b1); g.add(b2);
    // vách chắn sau cabin + tời kéo
    g.add(box(THREE, 2.4, 0.95, 0.14, DARK, 0, 1.8, -1.42));
    var winch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16), DARK);
    winch.rotation.z = Math.PI / 2; winch.position.set(0, 1.55, -1.12); g.add(winch);
    // sàn trượt thép + thanh viền đỏ
    g.add(box(THREE, 2.5, 0.22, 5.0, STEEL, 0, 1.24, 1.15));
    g.add(box(THREE, 0.07, 0.24, 5.0, RED, 1.27, 1.4, 1.15));
    g.add(box(THREE, 0.07, 0.24, 5.0, RED, -1.27, 1.4, 1.15));
    // sọc vàng đen + đèn hậu phía sau
    var stripes = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.34), new THREE.MeshBasicMaterial({ map: hazardStripes(THREE) }));
    stripes.position.set(0, 1.0, 3.66); g.add(stripes);
    g.add(box(THREE, 0.3, 0.16, 0.05, TAIL, 1.0, 1.0, 3.68));
    g.add(box(THREE, 0.3, 0.16, 0.05, TAIL, -1.0, 1.0, 3.68));
    // 6 bánh: 1 trục trước, 2 trục sau
    var tireGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 24);
    var hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16);
    [-2.75, 1.55, 2.75].forEach(function (z) {
      [-1.1, 1.1].forEach(function (x) {
        var t = new THREE.Mesh(tireGeo, TIRE); t.rotation.z = Math.PI / 2; t.position.set(x, 0.52, z); g.add(t);
        var h = new THREE.Mesh(hubGeo, HUB); h.rotation.z = Math.PI / 2; h.position.set(x * 1.01, 0.52, z); g.add(h);
      });
    });
    // bóng đổ mềm dưới xe
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 7.9), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; g.add(shadow);
    return { group: g, beacons: [B1, B2] };
  }

  function attach(map, gl, THREE, opts) {
    opts = opts || {};
    if (!map || !gl || !THREE || !gl.MercatorCoordinate) return null;
    var px = opts.px || 64;
    var vehicles = {};
    var scene = null, camera = null, renderer = null, tpl = null, beacons = [];
    var broken = false, t0 = (root.performance || Date).now(), timer = 0, rafId = 0;
    var rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

    function now() { return (root.performance || Date).now(); }
    function n180(a) { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
    function pose(v, t) {
      if (!v.dur || t >= v.start + v.dur) return v.to;
      var k = (t - v.start) / v.dur;
      return { pos: [v.from.pos[0] + (v.to.pos[0] - v.from.pos[0]) * k, v.from.pos[1] + (v.to.pos[1] - v.from.pos[1]) * k], h: v.from.h + n180(v.to.h - v.from.h) * Math.min(1, k * 1.5) };
    }
    function gliding(t) { for (var id in vehicles) { var v = vehicles[id]; if (v.dur && t < v.start + v.dur) return true; } return false; }
    function any() { for (var id in vehicles) return true; return false; }
    // vẽ lại: đang trượt → mỗi khung hình; đứng yên → ~8 lần / giây (chỉ để đèn nhấp nháy, đỡ tốn pin)
    function schedule() {
      if (broken || !any()) return;
      if (gliding(now())) { if (!rafId) rafId = root.requestAnimationFrame(function () { rafId = 0; map.triggerRepaint(); }); }
      else if (!timer) timer = root.setTimeout(function () { timer = 0; map.triggerRepaint(); }, 125);
    }

    var layer = {
      id: opts.id || 'resq-truck3d', type: 'custom', renderingMode: '3d',
      onAdd: function (m, ctx) {
        try {
          camera = new THREE.Camera();
          scene = new THREE.Scene();
          scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4656, 0.95));
          var sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(-40, 70, -30); scene.add(sun);
          renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: ctx, antialias: true });
          renderer.autoClear = false;
          if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
          var built = buildTruck(THREE); tpl = built.group; beacons = built.beacons;
        } catch (e) { broken = true; if (opts.onError) opts.onError(e); }
      },
      render: function (ctx, matrix) {
        if (broken || !renderer || !any()) return;
        try {
          var t = now(), z = map.getZoom();
          var on = Math.floor((t - t0) / 250) % 2 === 0;          // đèn ưu tiên: luân phiên 4 lần / giây
          beacons[0].emissiveIntensity = on ? 2.4 : 0.12;
          beacons[1].emissiveIntensity = on ? 0.12 : 2.4;
          var proj = new THREE.Matrix4().fromArray(matrix);
          var ids = Object.keys(vehicles);
          for (var i = 0; i < ids.length; i++) {
            var v = vehicles[ids[i]];
            for (var j = 0; j < ids.length; j++) vehicles[ids[j]].group.visible = (i === j);
            var p = pose(v, t);
            var mpp = 40075016.686 * Math.cos(p.pos[1] * Math.PI / 180) / (512 * Math.pow(2, z));
            var k = Math.max(1, (px * mpp) / LEN);
            v.ring.material.opacity = 0.22 + 0.16 * Math.sin((t - t0) / 260);
            var mc = gl.MercatorCoordinate.fromLngLat(p.pos, 0);
            var s = mc.meterInMercatorCoordinateUnits() * k;
            var model = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z)
              .scale(new THREE.Vector3(s, -s, s)).multiply(rotX)
              .multiply(new THREE.Matrix4().makeRotationY(-(p.h || 0) * Math.PI / 180));
            camera.projectionMatrix = proj.clone().multiply(model);
            renderer.resetState();
            renderer.render(scene, camera);
          }
          schedule();
        } catch (e) { broken = true; if (opts.onError) opts.onError(e); }
      }
    };

    function ensureLayer() {
      if (!map.getLayer(layer.id)) { try { map.addLayer(layer); } catch (e) { broken = true; if (opts.onError) opts.onError(e); } }
    }
    if (map.loaded && map.loaded()) ensureLayer(); else map.once('load', ensureLayer);

    return {
      setPose: function (id, pos, heading, tone, glideMs) {
        if (broken || !tpl || !pos) return;
        var t = now();
        var v = vehicles[id];
        var target = { pos: [pos[0], pos[1]], h: heading == null ? (v ? v.to.h : 0) : heading };
        if (!v) {
          var group = tpl.clone();
          var ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.0, 48), new THREE.MeshBasicMaterial({ color: TONE.normal, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; group.add(ring);
          scene.add(group);
          v = vehicles[id] = { group: group, ring: ring, from: target, to: target, start: t, dur: 0 };
        } else {
          v.from = pose(v, t); v.to = target; v.start = t; v.dur = glideMs || 0;
        }
        v.ring.material.color.setHex(TONE[tone] || TONE.normal);
        map.triggerRepaint();
      },
      remove: function (id) {
        var v = vehicles[id];
        if (!v) return;
        scene.remove(v.group); v.ring.geometry.dispose(); v.ring.material.dispose();
        delete vehicles[id];
        map.triggerRepaint();
      },
      clear: function () { for (var id in vehicles) this.remove(id); },
      ids: function () { return Object.keys(vehicles); },
      /** Đã dựng xong mô hình + WebGL chạy được → vẽ 3D. Chưa (đang tải) / lỗi → người gọi hiện biểu tượng 2D. */
      ready: function () { return !broken && !!tpl; },
      failed: function () { return broken; }
    };
  }

  root.ResQTruck3D = { attach: attach, buildTruck: buildTruck, LEN: LEN };
})(typeof window !== 'undefined' ? window : this);
`;

/** Three.js bản UMD (có build/three.min.js) — đã kiểm tra hướng / kích thước xe với đúng bản này. */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
