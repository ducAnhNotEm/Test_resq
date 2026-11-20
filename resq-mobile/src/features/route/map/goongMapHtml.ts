// goongMapHtml.ts: trang HTML chạy Goong Map JS (fork Mapbox GL v1) bên trong WebView.
//
// Giao thức (RN → Web): window.__resq(msg)
//   { type:'route', coords }            tuyến (một lần mỗi khi đổi tuyến)
//   { type:'progress', frac }           phần đã đi (0..1) — tô xám bằng line-gradient, KHÔNG gửi lại polyline
//   { type:'vehicle', pos, heading, tone }  1 Hz; nội suy 60 fps NGAY TRONG WebView (không spam cầu nối)
//   { type:'dest', pos, accuracyM }     ghim điểm cứu hộ + vòng sai số GPS
//   { type:'fallback', coords }         đường chim bay nét đứt khi chưa có tuyến
//   { type:'mode', mode }               'follow' (tài xế: bám xe, xoay theo hướng) | 'overview' (khách: toàn cảnh)
// (Web → RN): { type:'ready' } | { type:'error', code, message } | { type:'follow', paused }

export const GOONG_JS_VERSION = '1.0.9';

export function buildMapHtml(mapKey: string): string {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@${GOONG_JS_VERSION}/dist/goong-js.css">
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#e8eff7;overflow:hidden}
.veh{width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none}
.veh .halo{position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(37,99,235,.18)}
.veh .arrow{width:30px;height:30px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;will-change:transform}
.veh .arrow svg{display:block}
.veh.alert .halo{background:rgba(239,68,68,.25)} .veh.muted .halo{background:rgba(100,116,139,.25)}
.pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#e11d48;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)}
#recenter{position:absolute;right:12px;bottom:12px;display:none;border:0;border-radius:22px;padding:10px 14px;background:#0f172a;color:#fff;font:600 14px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.35)}
</style></head><body><div id="map"></div><button id="recenter">◎ Về vị trí xe</button>
<script src="https://cdn.jsdelivr.net/npm/@goongmaps/goong-js@${GOONG_JS_VERSION}/dist/goong-js.js"></script>
<script>
(function(){
var KEY = ${JSON.stringify(mapKey)};
var RN = window.ReactNativeWebView;
function post(m){ try{ RN && RN.postMessage(JSON.stringify(m)); }catch(e){} }
window.onerror = function(msg){ post({type:'error', code:'js', message:String(msg)}); };

var map = null, ready = false, mode = 'overview', pausedUntil = 0;
var routeCoords = null, destPos = null, needFit = true, raf = 0;
var veh = { el:null, arrow:null, marker:null, from:null, to:null, start:0, dur:0, lastPush:0, cur:null };
var destMarker = null;
var COLOR_LEFT = '#2563eb', COLOR_DONE = '#94a3b8';

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function n180(a){ a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
function hav(a,b){ var R=6371008.8, r=Math.PI/180, dLa=(b[1]-a[1])*r, dLo=(b[0]-a[0])*r;
  var s=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return 2*R*Math.asin(Math.min(1, Math.sqrt(s))); }
function circle(c, m){ var pts=[], n=48, k=m/111195; for(var i=0;i<=n;i++){ var a=i/n*2*Math.PI;
  pts.push([c[0]+k*Math.sin(a)/Math.cos(c[1]*Math.PI/180), c[1]+k*Math.cos(a)]); } return pts; }
function fc(features){ return { type:'FeatureCollection', features: features || [] }; }
function line(coords){ return { type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: coords } }; }

function init(){
  if (!window.goongjs){ post({type:'error', code:'cdn', message:'Không tải được thư viện bản đồ. Kiểm tra kết nối mạng.'}); return; }
  if (!KEY){ post({type:'error', code:'key', message:'Thiếu key bản đồ Goong (GOONG_MAP_KEY).'}); return; }
  goongjs.accessToken = KEY;
  map = new goongjs.Map({ container:'map', style:'https://tiles.goong.io/assets/goong_map_web.json',
    center:[105.8342,21.0278], zoom:12, attributionControl:false, dragRotate:true, touchPitch:false });
  map.on('error', function(e){
    var m = (e && e.error && (e.error.message || e.error.status)) || '';
    if (/40[13]|unauthor|forbidden|key/i.test(String(m))) post({type:'error', code:'key', message:'Key bản đồ Goong không hợp lệ hoặc bị giới hạn domain.'});
  });
  map.on('load', function(){
    map.addSource('acc', { type:'geojson', data: fc() });
    map.addLayer({ id:'acc-fill', type:'fill', source:'acc', paint:{ 'fill-color':'#e11d48', 'fill-opacity':0.1 } });
    map.addLayer({ id:'acc-line', type:'line', source:'acc', paint:{ 'line-color':'#e11d48', 'line-width':1, 'line-opacity':0.5 } });
    map.addSource('fallback', { type:'geojson', data: fc() });
    map.addLayer({ id:'fallback', type:'line', source:'fallback', paint:{ 'line-color':'#64748b', 'line-width':3, 'line-dasharray':[2,2] } });
    map.addSource('route', { type:'geojson', lineMetrics:true, data: fc() });
    map.addLayer({ id:'route-casing', type:'line', source:'route', layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#ffffff', 'line-width':11 } });
    map.addLayer({ id:'route', type:'line', source:'route', layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-width':7, 'line-gradient': grad(0) } });
    ready = true;
    post({ type:'ready' });
  });
  map.on('dragstart', function(e){
    if (e && e.originalEvent && mode === 'follow'){ pausedUntil = Date.now() + 15000; showRecenter(true); }
  });
  map.on('rotate', function(){ drawVehicle(veh.cur); });
}

function grad(frac){
  var f = clamp(frac || 0, 0, 0.9999);
  if (f <= 0.0001) return ['interpolate', ['linear'], ['line-progress'], 0, COLOR_LEFT, 1, COLOR_LEFT];
  return ['step', ['line-progress'], COLOR_DONE, f, COLOR_LEFT];
}

function showRecenter(v){ document.getElementById('recenter').style.display = v ? 'block' : 'none'; post({type:'follow', paused: !!v}); }
document.getElementById('recenter').onclick = function(){ pausedUntil = 0; showRecenter(false); if (veh.cur) follow(veh.to || veh.cur, 600); };

function fitAll(){
  if (!map) return;
  var b = new goongjs.LngLatBounds(), n = 0;
  if (routeCoords) for (var i=0;i<routeCoords.length;i++){ b.extend(routeCoords[i]); n++; }
  if (destPos){ b.extend(destPos); n++; }
  if (veh.cur){ b.extend(veh.cur.pos); n++; }
  if (!n) return;
  if (n === 1){ map.easeTo({ center: b.getCenter(), zoom: 16, duration: 500 }); return; }
  map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 50, right: 50 }, maxZoom: 16, duration: 600 });
}

function follow(t, dur){
  if (!map || !t) return;
  map.easeTo({ center: t.pos, bearing: t.h, pitch: 50, zoom: Math.max(map.getZoom(), 16.3), duration: dur,
    offset: [0, Math.round(map.getCanvas().clientHeight * 0.18)], easing: function(x){ return x; } });
}

function sample(now){
  if (!veh.from || !veh.to) return null;
  var t = veh.dur <= 0 ? 1 : clamp((now - veh.start) / veh.dur, 0, 1);
  var th = Math.min(1, t * 1.5);
  return { pos:[ veh.from.pos[0] + (veh.to.pos[0]-veh.from.pos[0])*t, veh.from.pos[1] + (veh.to.pos[1]-veh.from.pos[1])*t ],
           h: veh.from.h + n180(veh.to.h - veh.from.h) * th, done: t >= 1 };
}

function drawVehicle(s){
  if (!s || !veh.marker) return;
  veh.marker.setLngLat(s.pos);
  veh.arrow.style.transform = 'rotate(' + (s.h - map.getBearing()).toFixed(1) + 'deg)';
}

function loop(){
  if (raf) return;
  var step = function(){
    var s = sample(performance.now());
    if (s){ veh.cur = s; drawVehicle(s); }
    raf = (s && !s.done) ? requestAnimationFrame(step) : 0;
  };
  raf = requestAnimationFrame(step);
}

function setVehicle(v){
  if (!map) return;
  var now = performance.now();
  if (!v){ if (veh.marker){ veh.marker.remove(); veh.marker = null; veh.cur = veh.from = veh.to = null; } return; }
  if (!veh.marker){
    veh.el = document.createElement('div'); veh.el.className = 'veh';
    veh.el.innerHTML = '<div class="halo"></div><div class="arrow"><svg width="18" height="20" viewBox="-9 -10 18 20"><path d="M0 -9 L8 8 L0 3.5 L-8 8 Z" fill="#2563eb"/></svg></div>';
    veh.arrow = veh.el.querySelector('.arrow');
    veh.marker = new goongjs.Marker({ element: veh.el }).setLngLat(v.pos).addTo(map);
    veh.from = veh.to = veh.cur = { pos: v.pos, h: v.heading == null ? 0 : v.heading };
    veh.dur = 0; veh.lastPush = now;
    if (mode === 'overview') needFit = true;
  } else {
    var cur = sample(now) || veh.cur;
    var h = v.heading == null ? cur.h : v.heading;
    var far = hav(cur.pos, v.pos) > 400;            // reset / GPS nhảy được chấp nhận: đặt thẳng, không trượt
    veh.from = far ? { pos: v.pos, h: h } : { pos: cur.pos, h: cur.h };
    veh.to = { pos: v.pos, h: h };
    veh.start = now;
    veh.dur = far ? 0 : clamp(now - veh.lastPush, 200, 1500);
    veh.lastPush = now;
  }
  veh.el.className = 'veh ' + (v.tone || '');
  veh.arrow.querySelector('path').setAttribute('fill', v.tone === 'alert' ? '#ef4444' : v.tone === 'muted' ? '#64748b' : '#2563eb');
  if (mode === 'follow' && Date.now() > pausedUntil){
    if (pausedUntil){ pausedUntil = 0; showRecenter(false); }
    follow(veh.to, veh.dur || 400);
  } else if (mode === 'overview'){
    if (needFit){ needFit = false; fitAll(); }
    else if (!map.getBounds().contains(v.pos)) fitAll();          // xe ra khỏi khung nhìn: mở rộng khung
  }
  loop();
}

function setDest(d){
  if (!map) return;
  if (!d){ if (destMarker){ destMarker.remove(); destMarker = null; } destPos = null; map.getSource('acc').setData(fc()); return; }
  destPos = d.pos;
  if (!destMarker){ var el = document.createElement('div'); el.className = 'pin'; destMarker = new goongjs.Marker({ element: el, anchor:'bottom' }).setLngLat(d.pos).addTo(map); }
  else destMarker.setLngLat(d.pos);
  var acc = d.accuracyM && d.accuracyM > 5 ? Math.min(d.accuracyM, 2000) : 0;
  map.getSource('acc').setData(acc ? fc([{ type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[circle(d.pos, acc)] } }]) : fc());
  if (mode === 'overview') fitAll();
}

window.__resq = function(m){
  if (!ready || !m) return;
  try {
    if (m.type === 'route'){ routeCoords = m.coords && m.coords.length >= 2 ? m.coords : null;
      map.getSource('route').setData(routeCoords ? fc([line(routeCoords)]) : fc());
      if (mode === 'overview') fitAll(); }
    else if (m.type === 'progress'){ map.setPaintProperty('route', 'line-gradient', grad(m.frac)); }
    else if (m.type === 'vehicle'){ setVehicle(m.vehicle); }
    else if (m.type === 'dest'){ setDest(m.dest); }
    else if (m.type === 'fallback'){ map.getSource('fallback').setData(m.coords && m.coords.length >= 2 ? fc([line(m.coords)]) : fc()); }
    else if (m.type === 'mode'){ mode = m.mode; pausedUntil = 0; showRecenter(false);
      if (mode === 'overview'){ map.easeTo({ pitch: 0, bearing: 0, duration: 400 }); fitAll(); } else if (veh.to) follow(veh.to, 500); }
    else if (m.type === 'fit'){ fitAll(); }
  } catch (e) { post({ type:'error', code:'js', message: String(e && e.message || e) }); }
};
init();
})();
</script></body></html>`;
}
