// ResQ Admin — vanilla JS, không cần build. Phục vụ bởi server tại /admin.
// Mọi dữ liệu do người dùng nhập (tên, ghi chú, địa chỉ) đi qua esc() trước khi vào innerHTML.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (t) => t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const fmtDur = (s) => s == null ? '—' : s < 60 ? `${Math.round(s)} giây` : s < 3600 ? `${Math.round(s / 60)} phút` : `${(s / 3600).toFixed(1).replace('.', ',')} giờ`;
const fmtPct = (x) => x == null ? '—' : `${Math.round(x * 100)}%`;
const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.round(s / 60)} phút trước` : fmtTime(t); };

const STATUS = {
  requested: 'Chờ điều phối', assigned: 'Chờ tài xế nhận', enroute: 'Đang đến', arrived: 'Đã tới nơi',
  in_service: 'Đang hỗ trợ', completed: 'Hoàn thành', cancelled: 'Đã hủy',
};
const ISSUE = { tire: 'Thủng/nổ lốp', battery: 'Hết ắc quy', tow: 'Cần kéo xe', fuel: 'Hết nhiên liệu', lockout: 'Kẹt chìa', accident: 'Va chạm', engine: 'Hỏng máy', unknown: 'Chưa rõ' };
const ROLE = { customer: 'Khách hàng', staff: 'Tài xế cứu hộ', admin: 'Điều phối viên' };
const EVENT = {
  created: 'Khách tạo đơn', created_by_dispatcher: 'Tổng đài tạo hộ', assigned: 'Đã điều phối', accepted: 'Tài xế nhận đơn',
  declined: 'Tài xế từ chối', offer_timeout: 'Tài xế không phản hồi (hết 90 giây)', unassigned: 'Điều phối rút đơn',
  arrived: 'Xe tới hiện trường', in_service: 'Bắt đầu hỗ trợ', completed: 'Hoàn thành', cancelled: 'Đã hủy', rated: 'Khách đánh giá', edited: 'Sửa thông tin',
};
const ACTOR = { customer: 'khách', staff: 'tài xế', admin: 'điều phối', system: 'hệ thống' };

const statusChip = (s) => `<span class="chip ${esc(s)}">${esc(STATUS[s] ?? s)}</span>`;
const sosChip = (o) => o.priority === 'sos' ? `<span class="chip sos">SOS${o.injured ? ' · bị thương' : ''}</span>` : '';

// ======================= API =======================
const state = { token: sessionStorage.getItem('resq.token'), me: null, config: null, ws: null, wsTimer: null, live: { orders: new Map(), presences: new Map(), frames: new Map(), routes: new Map() } };

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/auth/login') { logout(); throw new Error('Phiên đăng nhập hết hạn'); }
  if (!res.ok) throw new Error(data?.error?.message ?? `Lỗi ${res.status}`);
  return data;
}

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

// ======================= AUTH =======================
async function boot() {
  if (!state.token) return showLogin();
  try {
    state.me = await api('GET', '/api/me');
    if (state.me.role !== 'admin') { logout(); return showLogin('Tài khoản này không có quyền điều phối'); }
    state.config = await api('GET', '/api/config');
    $('#login').hidden = true; $('#app').hidden = false;
    $('#meName').textContent = `${state.me.name} · ${state.me.email}`;
    connectWs();
    route();
  } catch { showLogin(); }
}
function showLogin(msg = '') { $('#app').hidden = true; $('#login').hidden = false; $('#loginError').textContent = msg; }
function logout() {
  sessionStorage.removeItem('resq.token'); state.token = null;
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  clearTimeout(state.wsTimer);
  showLogin();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('POST', '/api/auth/login', { email: f.get('email'), password: f.get('password') });
    if (r.user.role !== 'admin') { $('#loginError').textContent = 'Tài khoản này không có quyền điều phối'; return; }
    state.token = r.token; sessionStorage.setItem('resq.token', r.token);
    boot();
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', logout);

// ======================= REALTIME (ops) =======================
let wsRetry = 0;
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;
  setWs('', 'Đang kết nối…');
  ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', token: state.token })); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') { wsRetry = 0; ws.send(JSON.stringify({ type: 'ops' })); setWs('on', 'Realtime: trực tuyến'); }
    else if (m.type === 'presence') { state.live.presences.set(m.presence.userId, m.presence); emit('presence'); }
    else if (m.type === 'order') { onOrderUpdate(m.order); }
    else if (m.type === 'telemetry') { onTelemetry(m.msg); }
  };
  ws.onclose = () => {
    setWs('off', 'Mất kết nối realtime — đang thử lại');
    const delay = Math.min(30_000, 1000 * 2 ** wsRetry++) * (0.7 + Math.random() * 0.6);   // backoff + jitter
    state.wsTimer = setTimeout(connectWs, delay);
  };
}
function setWs(cls, text) { const el = $('#wsState'); el.className = `ws-state ${cls}`; $('span', el).textContent = text; }

const listeners = new Set();
const emit = (what) => listeners.forEach(l => l(what));
function onOrderUpdate(o) {
  const prev = state.live.orders.get(o.id);
  if (['completed', 'cancelled'].includes(o.status)) { state.live.orders.delete(o.id); state.live.frames.delete(o.id); state.live.routes.delete(o.id); }
  else state.live.orders.set(o.id, o);
  if (!prev && o.status === 'requested') toast(`Đơn mới ${o.id}${o.priority === 'sos' ? ' — SOS' : ''}`);
  emit('order');
  if (drawerOrderId === o.id) openOrder(o.id, true);
}
function onTelemetry(msg) {
  if (msg.type === 'frame') state.live.frames.set(msg.frame.orderId, msg.frame);
  else if (msg.type === 'route') state.live.routes.set(msg.orderId, msg.route);
  else if (msg.type === 'release') state.live.frames.delete(msg.orderId);
  emit('telemetry');
}

// ======================= ROUTER =======================
let cleanup = null;
function route() {
  const name = (location.hash.replace('#/', '') || 'overview').split('?')[0];
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
  if (cleanup) { cleanup(); cleanup = null; }
  const view = $('#view');
  view.innerHTML = '';
  const pages = { overview: pageOverview, ops: pageOps, orders: pageOrders, users: pageUsers };
  cleanup = (pages[name] ?? pageOverview)(view) ?? null;
}
window.addEventListener('hashchange', () => { if (state.me) route(); });

// ======================= TỔNG QUAN =======================
function pageOverview(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Tổng quan vận hành</h1><div class="muted small" id="genAt"></div></div></div>
    <div class="grid kpis" id="kpis"></div>
    <div class="grid two">
      <div class="card">
        <div class="chart-head"><h2>Đơn 7 ngày qua</h2><button class="btn small ghost" id="toggleTable">Xem bảng</button></div>
        <div class="legend" id="legend"></div>
        <div class="chart" id="chart"></div>
      </div>
      <div class="card"><h2>Cảnh báo cần xử lý</h2><div class="alerts" id="alerts"></div></div>
    </div>`;
  let showTable = false;
  let lastStats = null;
  $('#toggleTable').onclick = () => { showTable = !showTable; $('#toggleTable').textContent = showTable ? 'Xem biểu đồ' : 'Xem bảng'; if (lastStats) renderChart(lastStats.days, showTable); };

  const load = guard(async () => {
    const [s, alerts] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/alerts')]);
    lastStats = s;
    $('#genAt').textContent = `Cập nhật ${fmtTime(s.generatedAt)} · tự làm mới mỗi 10 giây`;
    const kpi = (label, value, sub = '') => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    $('#kpis').innerHTML = [
      kpi('Đơn đang mở', s.active.total, `${s.active.sos} SOS · ${s.active.byStatus.requested ?? 0} chờ điều phối`),
      kpi('Tài xế sẵn sàng', s.staff.available, `${s.staff.busy} đang làm đơn · ${s.staff.total} trực tuyến`),
      kpi('Hôm nay', s.today.created, `${s.today.completed} hoàn thành · ${s.today.cancelled} hủy`),
      kpi('Thời gian có xe (P50)', fmtDur(s.week.responseP50S), `P90: ${fmtDur(s.week.responseP90S)} · 7 ngày`),
      kpi('Điều phối (P50)', fmtDur(s.week.assignP50S), `P90: ${fmtDur(s.week.assignP90S)}`),
      kpi('Đạt SLA 30 phút', fmtPct(s.week.slaHitRate), 'tỷ lệ đơn có xe trong 30 phút'),
      kpi('Tỷ lệ hủy', fmtPct(s.week.cancelRate), '7 ngày'),
      kpi('Đánh giá TB', s.week.avgRating ? s.week.avgRating.toFixed(1).replace('.', ',') + ' / 5' : '—', '7 ngày'),
    ].join('');
    renderChart(s.days, showTable);
    $('#alerts').innerHTML = alerts.length
      ? alerts.map(a => `<button class="alert ${a.level}" data-order="${esc(a.orderId ?? '')}"><span class="tag">${a.level === 'critical' ? 'KHẨN' : 'CHÚ Ý'}</span><span>${esc(a.message)}<br><span class="muted small">${ago(a.since)}</span></span></button>`).join('')
      : '<div class="empty">Không có cảnh báo. Mọi đơn đang trong ngưỡng SLA.</div>';
    $('#alerts').querySelectorAll('[data-order]').forEach(b => b.onclick = () => b.dataset.order && openOrder(b.dataset.order));
  });
  load();
  const t = setInterval(load, 10_000);
  return () => clearInterval(t);
}

// Biểu đồ cột chồng: mỗi ngày = tổng đơn tạo, chia theo kết quả (hoàn thành / hủy / đang xử lý)
const SERIES = [
  { key: 'completed', label: 'Hoàn thành', color: 'var(--series-1)' },
  { key: 'cancelled', label: 'Đã hủy', color: 'var(--series-2)' },
  { key: 'open', label: 'Đang xử lý', color: 'var(--series-3)' },
];
function renderChart(days, asTable) {
  const rows = days.map(d => ({ ...d, open: Math.max(0, d.created - d.completed - d.cancelled), label: new Date(d.day + 7 * 3600_000).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }) }));
  $('#legend').innerHTML = SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  const box = $('#chart');
  if (asTable) {
    box.innerHTML = `<table><thead><tr><th>Ngày</th><th>Tổng</th>${SERIES.map(s => `<th>${s.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${r.created}</td>${SERIES.map(s => `<td class="num">${r[s.key]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return;
  }
  const W = 560, H = 220, padL = 30, padB = 26, padT = 18;
  const max = Math.max(4, ...rows.map(r => r.created));
  const nice = Math.ceil(max / 4) * 4;
  const plotH = H - padB - padT;
  const band = (W - padL) / rows.length;
  const bw = Math.min(36, band * 0.56);
  const y = v => padT + plotH - (v / nice) * plotH;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Số đơn cứu hộ 7 ngày qua theo kết quả">`;
  for (let i = 0; i <= 4; i++) {
    const v = (nice / 4) * i;
    svg += `<line class="gridline" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke-width="1"/><text class="axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  rows.forEach((r, i) => {
    const x = padL + band * i + (band - bw) / 2;
    let acc = 0;
    const segs = SERIES.filter(s => r[s.key] > 0);
    segs.forEach((s, j) => {
      const v = r[s.key];
      const top = y(acc + v), bottom = y(acc);
      const h = Math.max(0, bottom - top - (j > 0 ? 2 : 0));     // khe 2px giữa các đoạn
      const isTop = j === segs.length - 1;
      const rr = isTop ? Math.min(4, h / 2, bw / 2) : 0;
      svg += isTop
        ? `<path d="M${x},${top + h} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${top + h} Z" fill="${s.color}"/>`
        : `<rect x="${x}" y="${top}" width="${bw}" height="${h}" fill="${s.color}"/>`;
      acc += v;
    });
    if (r.created > 0) svg += `<text class="total" x="${x + bw / 2}" y="${y(r.created) - 5}" text-anchor="middle">${r.created}</text>`;
    svg += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(r.label)}</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" fill="transparent"/>`;
  });
  svg += `<line x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/></svg><div class="tooltip" hidden></div>`;
  box.innerHTML = svg;
  const tip = $('.tooltip', box);
  box.querySelectorAll('.hit').forEach(h => {
    h.addEventListener('mousemove', (ev) => {
      const r = rows[Number(h.dataset.i)];
      tip.innerHTML = `<b>${esc(r.label)}</b> · ${r.created} đơn` + SERIES.map(s => `<div class="row"><span><i style="background:${s.color}"></i>${s.label}</span><b class="num">${r[s.key]}</b></div>`).join('');
      const b = box.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = `${Math.min(b.width - 170, ev.clientX - b.left + 12)}px`;
      tip.style.top = `${ev.clientY - b.top - 10}px`;
    });
    h.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

// ======================= BẢN ĐỒ ĐIỀU HÀNH =======================
function makeMap(el, center = [105.8342, 21.0278], zoom = 12) {
  if (!window.goongjs || !state.config?.goongMapKey) {
    el.innerHTML = '<div class="map-missing">Chưa cấu hình GOONG_MAP_KEY trên server — bản đồ không hiển thị.<br>Dữ liệu vẫn cập nhật ở danh sách bên cạnh.</div>';
    return null;
  }
  goongjs.accessToken = state.config.goongMapKey;
  const map = new goongjs.Map({ container: el, style: 'https://tiles.goong.io/assets/goong_map_web.json', center, zoom });
  map.addControl(new goongjs.NavigationControl({ showCompass: true }), 'top-right');
  return map;
}
const emptyFC = () => ({ type: 'FeatureCollection', features: [] });

function pageOps(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Bản đồ điều hành</h1><div class="muted small">Vị trí tài xế, đơn đang mở và xe đang chạy — cập nhật trực tiếp</div></div></div>
    <div class="ops">
      <div>
        <div class="map-tools">
          <label style="display:flex;flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="heat" style="width:auto"> Bản đồ nhiệt sự cố 30 ngày</label>
          <span class="chip" style="background:var(--good-bg);color:var(--good)">Tài xế sẵn sàng</span>
          <span class="chip enroute">Tài xế đang làm đơn</span>
          <span class="chip off">Mất tín hiệu &gt; 5 phút</span>
        </div>
        <div class="map" id="opsMap" style="height:calc(100% - 36px)"></div>
      </div>
      <div class="side-list" id="opsList"></div>
    </div>`;
  const map = makeMap($('#opsMap'));
  const markers = { staff: new Map(), order: new Map(), veh: new Map() };

  const load = guard(async () => {
    const live = await api('GET', '/api/admin/live');
    state.live.orders = new Map(live.orders.map(o => [o.id, o]));
    state.live.presences = new Map(live.presences.map(p => [p.userId, p]));
    for (const m of live.telemetry) onTelemetry(m);
    render();
  });

  function syncMarkers(kind, items, keyOf, build, posOf) {
    if (!map) return;
    const seen = new Set();
    for (const it of items) {
      const k = keyOf(it); seen.add(k);
      let mk = markers[kind].get(k);
      if (!mk) { mk = new goongjs.Marker({ element: build(it) }).setLngLat(posOf(it)).addTo(map); markers[kind].set(k, mk); }
      else { mk.setLngLat(posOf(it)); const fresh = build(it); mk.getElement().className = fresh.className; mk.getElement().innerHTML = fresh.innerHTML; mk.getElement().title = fresh.title; }
    }
    for (const [k, mk] of markers[kind]) if (!seen.has(k)) { mk.remove(); markers[kind].delete(k); }
  }

  function render() {
    const orders = [...state.live.orders.values()].sort((a, b) => (b.priority === 'sos') - (a.priority === 'sos') || a.createdAt - b.createdAt);
    const busy = new Set(orders.map(o => o.staff?.id).filter(Boolean));
    $('#opsList').innerHTML = orders.length ? orders.map(o => {
      const f = state.live.frames.get(o.id);
      return `<div class="order-card ${o.priority === 'sos' ? 'sos' : ''}" data-id="${esc(o.id)}">
        <div class="top"><b class="mono">${esc(o.id)}</b>${statusChip(o.status)}</div>
        <div>${sosChip(o)} ${esc(ISSUE[o.issue] ?? o.issue)} · ${esc(o.customer.name)}</div>
        <div class="muted small">${esc(o.address || `${o.location.lat.toFixed(5)}, ${o.location.lng.toFixed(5)}`)}</div>
        <div class="small">${o.staff ? `Tài xế: ${esc(o.staff.name)} (${esc(o.staff.vehiclePlate)})` : '<b style="color:var(--critical)">Chưa có tài xế</b>'}${f ? ` · còn ${fmtDist(f.remainingM)}, ~${Math.max(1, Math.round(f.etaS / 60))} phút` : ''}</div>
        <div class="muted small">Tạo ${ago(o.createdAt)}</div></div>`;
    }).join('') : '<div class="empty card">Không có đơn nào đang mở.</div>';
    $('#opsList').querySelectorAll('.order-card').forEach(c => c.onclick = () => openOrder(c.dataset.id));
    if (!map) return;

    syncMarkers('order', orders, o => o.id, o => { const e = document.createElement('div'); e.className = `mk-order ${o.priority === 'sos' ? 'sos' : ''}`; e.title = `${o.id} · ${STATUS[o.status]}`; e.onclick = () => openOrder(o.id); return e; }, o => [o.location.lng, o.location.lat]);
    const now = Date.now();
    // tài xế đang có xe chạy trực tiếp đã hiện bằng mũi tên xe → không vẽ thêm chấm vị trí
    const driving = new Set([...state.live.frames.keys()].map(id => state.live.orders.get(id)?.staff?.id).filter(Boolean));
    syncMarkers('staff', [...state.live.presences.values()].filter(p => !driving.has(p.userId)), p => p.userId, p => {
      const e = document.createElement('div');
      const stale = now - p.updatedAt > 5 * 60_000;
      e.className = `mk-staff ${stale ? 'stale' : busy.has(p.userId) ? 'busy' : p.available ? 'available' : 'stale'}`;
      e.textContent = (p.name || '?').trim().split(/\s+/).pop()[0] ?? '?';
      e.title = `${p.name} · ${p.available ? 'sẵn sàng' : 'tắt nhận đơn'} · ${ago(p.updatedAt)}`;
      return e;
    }, p => p.pos);
    syncMarkers('veh', [...state.live.frames.values()], f => f.orderId, f => {
      const e = document.createElement('div'); e.className = 'mk-veh'; e.title = `Xe đơn ${f.orderId} · ${f.speedMps != null ? Math.round(f.speedMps * 3.6) + ' km/h' : ''}`;
      e.innerHTML = `<span style="transform:rotate(${f.heading ?? 0}deg)"></span>`; e.onclick = () => openOrder(f.orderId); return e;
    }, f => f.pos);
    const src = map.getSource('routes');
    if (src) src.setData({ type: 'FeatureCollection', features: [...state.live.routes.entries()].filter(([id]) => state.live.orders.has(id)).map(([id, r]) => ({ type: 'Feature', properties: { id }, geometry: { type: 'LineString', coordinates: r.coords } })) });
  }

  if (map) map.on('load', () => {
    map.addSource('routes', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', paint: { 'line-color': '#ffffff', 'line-width': 7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'routes', type: 'line', source: 'routes', paint: { 'line-color': '#2a78d6', 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addSource('heat', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'heat', type: 'heatmap', source: 'heat', layout: { visibility: 'none' }, paint: { 'heatmap-radius': 28, 'heatmap-opacity': 0.75, 'heatmap-weight': ['case', ['==', ['get', 'priority'], 'sos'], 2, 1] } });
    render();
  });
  $('#heat').onchange = guard(async (e) => {
    if (!map) return;
    if (e.target.checked) {
      const pts = await api('GET', '/api/admin/heatmap?days=30');
      map.getSource('heat')?.setData({ type: 'FeatureCollection', features: pts.map(p => ({ type: 'Feature', properties: { priority: p.priority }, geometry: { type: 'Point', coordinates: p.pos } })) });
    }
    map.setLayoutProperty('heat', 'visibility', e.target.checked ? 'visible' : 'none');
  });

  const onLive = () => render();
  listeners.add(onLive);
  load();
  const tick = setInterval(render, 15_000);        // làm mới nhãn "x giây trước" / màu mất tín hiệu
  return () => { listeners.delete(onLive); clearInterval(tick); map?.remove(); };
}

// ======================= ĐƠN CỨU HỘ =======================
function pageOrders(view) {
  let offset = 0;
  const limit = 25;
  view.innerHTML = `
    <div class="page-head"><div><h1>Đơn cứu hộ</h1><div class="muted small">Ưu tiên SOS lên đầu · bấm vào đơn để xem / điều phối</div></div>
      <button class="btn primary" id="newOrder">+ Tạo đơn hộ khách (tổng đài)</button></div>
    <div class="toolbar">
      <input id="q" placeholder="Tìm mã đơn, tên / SĐT khách, biển số, địa chỉ" />
      <select id="st"><option value="">Mọi trạng thái</option><option value="active">Đang mở</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Mã</th><th>Trạng thái</th><th>Khách</th><th>Sự cố</th><th>Tài xế</th><th>Địa chỉ</th><th>Tạo lúc</th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager"><span class="muted small" id="pageInfo"></span><button class="btn small" id="prev">‹ Trước</button><button class="btn small" id="next">Sau ›</button></div>`;
  const load = guard(async () => {
    const st = $('#st').value;
    const qs = new URLSearchParams({ limit, offset, ...(st === 'active' ? { active: '1' } : st ? { status: st } : {}), ...($('#q').value ? { q: $('#q').value } : {}) });
    const { items, total } = await api('GET', `/api/admin/orders?${qs}`);
    $('#rows').innerHTML = items.length ? items.map(o => `<tr data-id="${esc(o.id)}">
      <td class="mono">${esc(o.id)}</td><td>${statusChip(o.status)} ${sosChip(o)}</td>
      <td>${esc(o.customer.name)}<div class="muted small">${esc(o.customer.phone)}</div></td>
      <td>${esc(ISSUE[o.issue] ?? o.issue)}<div class="muted small mono">${esc(o.vehiclePlate)}</div></td>
      <td>${o.staff ? esc(o.staff.name) : '<span class="muted">—</span>'}</td>
      <td class="small">${esc(o.address || '—')}</td><td class="small">${fmtTime(o.createdAt)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">Không có đơn phù hợp.</td></tr>';
    $('#rows').querySelectorAll('tr[data-id]').forEach(r => r.onclick = () => openOrder(r.dataset.id));
    $('#pageInfo').textContent = total ? `${offset + 1}–${Math.min(offset + limit, total)} / ${total}` : '';
    $('#prev').disabled = offset === 0; $('#next').disabled = offset + limit >= total;
  });
  let deb;
  $('#q').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { offset = 0; load(); }, 300); };
  $('#st').onchange = () => { offset = 0; load(); };
  $('#prev').onclick = () => { offset = Math.max(0, offset - limit); load(); };
  $('#next').onclick = () => { offset += limit; load(); };
  $('#newOrder').onclick = guard(newOrderModal);
  const onLive = (w) => { if (w === 'order') load(); };
  listeners.add(onLive);
  load();
  return () => listeners.delete(onLive);
}

async function newOrderModal() {
  const { items } = await api('GET', '/api/admin/users?role=customer&limit=200');
  const dlg = $('#modal');
  dlg.innerHTML = `<form method="dialog" id="f">
    <h2>Tạo đơn hộ khách</h2>
    <p class="muted small">Dùng khi khách gọi tổng đài (không có app, hết pin, không biết dùng). Hỏi khách mốc địa điểm, có người bị thương không.</p>
    <label>Khách hàng<select name="customerId" required>${items.map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(u.phone)}</option>`).join('')}</select></label>
    <div class="row2"><label>Vĩ độ (lat)<input name="lat" required inputmode="decimal" placeholder="21.0020"></label><label>Kinh độ (lng)<input name="lng" required inputmode="decimal" placeholder="105.8157"></label></div>
    <label>Địa chỉ / mốc nhận biết<input name="address" maxlength="300"></label>
    <div class="row2"><label>Sự cố<select name="issue">${Object.entries(ISSUE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Có người bị thương?<select name="injured"><option value="false">Không</option><option value="true">CÓ — ưu tiên SOS</option></select></label></div>
    <label>Ghi chú<textarea name="note" rows="2" maxlength="1000"></textarea></label>
    <p class="error" id="ferr"></p>
    <div class="actions"><button class="btn primary" value="ok">Tạo đơn & điều phối</button><button class="btn" value="cancel" formnovalidate>Hủy</button></div></form>`;
  dlg.showModal();
  $('#f', dlg).onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const injured = f.get('injured') === 'true';
      const o = await api('POST', '/api/admin/orders', {
        customerId: Number(f.get('customerId')), lat: Number(f.get('lat')), lng: Number(f.get('lng')), address: f.get('address'),
        issue: f.get('issue'), injured, priority: injured ? 'sos' : 'normal', note: f.get('note'),
      });
      dlg.close(); toast(`Đã tạo ${o.id} — ${STATUS[o.status]}`); openOrder(o.id);
    } catch (err) { $('#ferr', dlg).textContent = err.message; }
  };
}

let drawerOrderId = null;
let drawerMap = null;
async function openOrder(id, refresh = false) {
  try {
    const { order: o, events, track } = await api('GET', `/api/admin/orders/${encodeURIComponent(id)}`);
    drawerOrderId = o.id;
    const d = $('#drawer');
    const active = !['completed', 'cancelled'].includes(o.status);
    d.hidden = false;
    d.innerHTML = `
      <div class="head"><div><h1 class="mono">${esc(o.id)}</h1><div>${statusChip(o.status)} ${sosChip(o)}</div></div><button class="btn ghost" id="closeDrawer" aria-label="Đóng">✕</button></div>
      ${o.injured ? '<div class="alert critical"><span class="tag">AN TOÀN</span><span>Có người bị thương: xác nhận đã gọi 115 / hướng dẫn khách sơ cứu, không di chuyển nạn nhân.</span></div>' : ''}
      <dl class="kv">
        <dt>Khách</dt><dd>${esc(o.customer.name)} · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></dd>
        <dt>Sự cố</dt><dd>${esc(ISSUE[o.issue] ?? o.issue)} · <span class="mono">${esc(o.vehiclePlate)}</span></dd>
        <dt>Vị trí</dt><dd>${esc(o.address || '—')}<div class="muted small mono">${o.location.lat.toFixed(6)}, ${o.location.lng.toFixed(6)}${o.location.accuracyM != null ? ` · sai số ±${Math.round(o.location.accuracyM)} m` : ''}</div></dd>
        <dt>Ghi chú</dt><dd>${esc(o.note || '—')}</dd>
        <dt>Tài xế</dt><dd>${o.staff ? `${esc(o.staff.name)} · ${esc(o.staff.vehiclePlate)} · <a href="tel:${esc(o.staff.phone)}">${esc(o.staff.phone)}</a>` : '<span class="muted">Chưa điều phối</span>'}</dd>
        ${o.cancelReason ? `<dt>Lý do hủy</dt><dd>${esc(o.cancelReason)}</dd>` : ''}
        ${o.rating ? `<dt>Đánh giá</dt><dd>${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)}</dd>` : ''}
      </dl>
      <div class="actions">
        ${active && ['requested', 'assigned'].includes(o.status) ? '<button class="btn primary" id="aAssign">Điều phối tài xế…</button>' : ''}
        ${active && ['assigned', 'enroute'].includes(o.status) ? '<button class="btn" id="aUnassign">Rút đơn khỏi tài xế</button>' : ''}
        ${o.status === 'arrived' ? '<button class="btn" id="aStart">Bắt đầu hỗ trợ</button>' : ''}
        ${o.status === 'in_service' ? '<button class="btn" id="aComplete">Hoàn thành</button>' : ''}
        ${active ? '<button class="btn" id="aEdit">Sửa</button><button class="btn danger" id="aCancel">Hủy đơn</button>' : ''}
        ${o.status === 'cancelled' ? '<button class="btn danger" id="aDelete">Xóa đơn</button>' : ''}
      </div>
      <div id="cands"></div>
      <div><h2>Hành trình xe ${track.length ? `<span class="muted small">(${track.length} điểm, lưu mỗi 10 giây)</span>` : ''}</h2><div class="mini-map" id="miniMap"></div></div>
      <div><h2>Nhật ký</h2><ul class="timeline">${events.map(e => `<li><b>${esc(EVENT[e.type] ?? e.type)}</b> <span class="muted small">· ${fmtTime(e.at)} · ${esc(ACTOR[e.actorRole] ?? e.actorRole)}</span>${e.data?.reason ? `<div class="muted small">${esc(e.data.reason)}</div>` : ''}${e.data?.staffName ? `<div class="muted small">→ ${esc(e.data.staffName)}</div>` : ''}</li>`).join('')}</ul></div>`;
    $('#closeDrawer').onclick = closeDrawer;
    const act = (sel, fn) => { const b = $(sel, d); if (b) b.onclick = guard(fn); };
    act('#aAssign', () => showCandidates(o));
    act('#aUnassign', async () => { const r = prompt('Lý do rút đơn (xe hỏng, tài xế mất liên lạc…)'); if (r === null) return; await api('POST', `/api/admin/orders/${o.id}/unassign`, { reason: r }); toast('Đã đưa đơn về hàng chờ'); });
    act('#aStart', async () => { await api('POST', `/api/orders/${o.id}/start`); });
    act('#aComplete', async () => { await api('POST', `/api/orders/${o.id}/complete`, { note: 'Điều phối xác nhận hoàn thành' }); });
    act('#aCancel', async () => { const r = prompt('Lý do hủy đơn'); if (r === null) return; await api('POST', `/api/orders/${o.id}/cancel`, { reason: r }); toast('Đã hủy đơn'); });
    act('#aDelete', async () => { if (!confirm(`Xóa vĩnh viễn đơn ${o.id}?`)) return; await api('DELETE', `/api/admin/orders/${o.id}`); closeDrawer(); toast('Đã xóa đơn'); emit('order'); });
    act('#aEdit', () => editOrderModal(o));

    if (!refresh || !drawerMap) {
      drawerMap?.remove();
      drawerMap = makeMap($('#miniMap'), [o.location.lng, o.location.lat], 14);
      if (drawerMap) drawerMap.on('load', () => {
        new goongjs.Marker({ color: o.priority === 'sos' ? '#c81e1e' : '#eb6834' }).setLngLat([o.location.lng, o.location.lat]).addTo(drawerMap);
        if (track.length >= 2) {
          drawerMap.addSource('trk', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: track.map(p => p.pos) } } });
          drawerMap.addLayer({ id: 'trk', type: 'line', source: 'trk', paint: { 'line-color': '#2a78d6', 'line-width': 4 }, layout: { 'line-cap': 'round' } });
          const b = new goongjs.LngLatBounds();
          [...track.map(p => p.pos), [o.location.lng, o.location.lat]].forEach(p => b.extend(p));
          drawerMap.fitBounds(b, { padding: 30, maxZoom: 16, duration: 0 });
        }
      });
    }
  } catch (e) { toast(e.message, true); }
}
function closeDrawer() { $('#drawer').hidden = true; drawerOrderId = null; drawerMap?.remove(); drawerMap = null; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden && !$('#modal').open) closeDrawer(); });

async function showCandidates(o) {
  const box = $('#cands');
  box.innerHTML = '<div class="muted small">Đang tính tài xế phù hợp…</div>';
  const cands = await api('GET', `/api/admin/orders/${o.id}/candidates`);
  box.innerHTML = `<h2>Tài xế đề xuất</h2>` + (cands.length ? cands.map(c => `<div class="cand"><div><b>${esc(c.name)}</b><div class="muted small">cách ${fmtDist(c.distanceM)} · ETA ~${Math.max(1, Math.round(c.etaS / 60))} phút ${c.etaSource === 'goong' ? '(Goong, đường thật)' : '(ước lượng)'} · vị trí ${c.presenceAgeS} giây trước</div></div><button class="btn small primary" data-id="${c.staffId}">Giao</button></div>`).join('')
    : '<div class="empty">Không có tài xế sẵn sàng trong bán kính 30 km (đang bận, tắt nhận đơn, mất tín hiệu, hoặc đã từ chối đơn này).</div>');
  box.querySelectorAll('button[data-id]').forEach(b => b.onclick = guard(async () => {
    await api('POST', `/api/admin/orders/${o.id}/assign`, { staffId: Number(b.dataset.id) });
    toast('Đã giao đơn — chờ tài xế nhận (90 giây)');
  }));
}

function editOrderModal(o) {
  const dlg = $('#modal');
  dlg.innerHTML = `<form method="dialog" id="f"><h2>Sửa đơn ${esc(o.id)}</h2>
    <label>Địa chỉ<input name="address" value="${esc(o.address)}" maxlength="300"></label>
    <div class="row2"><label>Sự cố<select name="issue">${Object.entries(ISSUE).map(([k, v]) => `<option value="${k}" ${k === o.issue ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Ưu tiên<select name="priority"><option value="normal" ${o.priority === 'normal' ? 'selected' : ''}>Thường</option><option value="sos" ${o.priority === 'sos' ? 'selected' : ''}>SOS</option></select></label></div>
    <label>Biển số<input name="vehiclePlate" value="${esc(o.vehiclePlate)}" maxlength="20"></label>
    <label>Ghi chú<textarea name="note" rows="3" maxlength="1000">${esc(o.note)}</textarea></label>
    <p class="error" id="ferr"></p>
    <div class="actions"><button class="btn primary" value="ok">Lưu</button><button class="btn" value="cancel" formnovalidate>Hủy</button></div></form>`;
  dlg.showModal();
  $('#f', dlg).onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('PATCH', `/api/admin/orders/${o.id}`, f); dlg.close(); toast('Đã lưu'); openOrder(o.id, true); }
    catch (err) { $('#ferr', dlg).textContent = err.message; }
  };
}

// ======================= NGƯỜI DÙNG =======================
function pageUsers(view) {
  let offset = 0;
  const limit = 25;
  view.innerHTML = `
    <div class="page-head"><div><h1>Người dùng</h1><div class="muted small">Khách hàng, tài xế cứu hộ và điều phối viên</div></div><button class="btn primary" id="newUser">+ Thêm người dùng</button></div>
    <div class="toolbar"><input id="q" placeholder="Tìm tên, email, SĐT, biển số" />
      <select id="role"><option value="">Mọi vai trò</option>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Vai trò</th><th>Email</th><th>SĐT</th><th>Xe / Đơn vị</th><th>Trạng thái</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager"><span class="muted small" id="pageInfo"></span><button class="btn small" id="prev">‹ Trước</button><button class="btn small" id="next">Sau ›</button></div>`;
  const load = guard(async () => {
    const qs = new URLSearchParams({ limit, offset, ...($('#role').value ? { role: $('#role').value } : {}), ...($('#q').value ? { q: $('#q').value } : {}) });
    const { items, total } = await api('GET', `/api/admin/users?${qs}`);
    $('#rows').innerHTML = items.length ? items.map(u => `<tr data-id="${u.id}">
      <td><b>${esc(u.name)}</b></td><td><span class="chip role-${esc(u.role)}">${esc(ROLE[u.role])}</span></td>
      <td>${esc(u.email)}</td><td>${esc(u.phone || '—')}</td>
      <td class="small"><span class="mono">${esc(u.vehiclePlate || '')}</span> ${esc(u.unit || '')}</td>
      <td>${u.active ? '<span class="chip completed">Hoạt động</span>' : '<span class="chip off">Đã khóa</span>'}</td>
      <td style="white-space:nowrap"><button class="btn small" data-act="edit">Sửa</button> <button class="btn small" data-act="toggle">${u.active ? 'Khóa' : 'Mở khóa'}</button> <button class="btn small danger" data-act="del">Xóa</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">Không có người dùng phù hợp.</td></tr>';
    $('#pageInfo').textContent = total ? `${offset + 1}–${Math.min(offset + limit, total)} / ${total}` : '';
    $('#prev').disabled = offset === 0; $('#next').disabled = offset + limit >= total;
    $('#rows').querySelectorAll('tr[data-id]').forEach(tr => {
      const u = items.find(x => String(x.id) === tr.dataset.id);
      tr.onclick = guard(async (e) => {
        const act = e.target.dataset?.act;
        if (act === 'toggle') { await api('PATCH', `/api/admin/users/${u.id}`, { active: !u.active }); toast(u.active ? `Đã khóa ${u.name} — phiên đăng nhập bị thu hồi ngay` : `Đã mở khóa ${u.name}`); load(); }
        else if (act === 'del') { if (!confirm(`Xóa ${u.name}?`)) return; await api('DELETE', `/api/admin/users/${u.id}`); toast('Đã xóa'); load(); }
        else userModal(u, load);
      });
    });
  });
  let deb;
  $('#q').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { offset = 0; load(); }, 300); };
  $('#role').onchange = () => { offset = 0; load(); };
  $('#prev').onclick = () => { offset = Math.max(0, offset - limit); load(); };
  $('#next').onclick = () => { offset += limit; load(); };
  $('#newUser').onclick = () => userModal(null, load);
  load();
}

function userModal(u, done) {
  const dlg = $('#modal');
  dlg.innerHTML = `<form method="dialog" id="f"><h2>${u ? `Sửa ${esc(u.name)}` : 'Thêm người dùng'}</h2>
    <label>Họ tên<input name="name" required maxlength="120" value="${esc(u?.name)}"></label>
    <div class="row2"><label>Email<input name="email" type="email" required value="${esc(u?.email)}"></label>
      <label>Vai trò<select name="role">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <div class="row2"><label>Số điện thoại<input name="phone" maxlength="20" value="${esc(u?.phone)}"></label>
      <label>Biển số xe<input name="vehiclePlate" maxlength="20" value="${esc(u?.vehiclePlate)}"></label></div>
    <label>Đơn vị cứu hộ (tài xế)<input name="unit" maxlength="120" value="${esc(u?.unit)}"></label>
    <label>${u ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu (tối thiểu 8 ký tự)'}<input name="password" type="password" minlength="8" ${u ? '' : 'required'} autocomplete="new-password"></label>
    <p class="error" id="ferr"></p>
    <div class="actions"><button class="btn primary" value="ok">${u ? 'Lưu' : 'Tạo'}</button><button class="btn" value="cancel" formnovalidate>Hủy</button></div></form>`;
  dlg.showModal();
  $('#f', dlg).onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (!body.password) delete body.password;
    try {
      if (u) await api('PATCH', `/api/admin/users/${u.id}`, body); else await api('POST', '/api/admin/users', body);
      dlg.close(); toast(u ? 'Đã lưu' : 'Đã tạo người dùng'); done();
    } catch (err) { $('#ferr', dlg).textContent = err.message; }
  };
}

boot();
