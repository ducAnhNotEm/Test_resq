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
  requested: 'Chờ điều phối', assigned: 'Chờ gara nhận', enroute: 'Đang đến', arrived: 'Đã tới nơi',
  in_service: 'Đang hỗ trợ', completed: 'Hoàn thành', cancelled: 'Đã hủy',
};
const ISSUE = { tire: 'Thủng/nổ lốp', battery: 'Hết ắc quy', tow: 'Cần kéo xe', fuel: 'Hết nhiên liệu', lockout: 'Kẹt chìa', accident: 'Va chạm', engine: 'Hỏng máy', unknown: 'Chưa rõ' };
const ROLE = { customer: 'Khách hàng', staff: 'Nhân viên gara', garage: 'Chủ gara', admin: 'Điều phối viên' };
const EVENT = {
  created: 'Khách tạo đơn', created_by_dispatcher: 'Tổng đài tạo hộ', assigned: 'Đã điều phối', accepted: 'Gara nhận đơn',
  declined: 'Gara từ chối', offer_timeout: 'Gara không phản hồi (hết 90 giây)', unassigned: 'Điều phối rút đơn',
  arrived: 'Xe tới hiện trường', in_service: 'Bắt đầu hỗ trợ', completed: 'Hoàn thành', cancelled: 'Đã hủy', rated: 'Khách đánh giá', edited: 'Sửa thông tin',
  held: 'Chưa tự giao — chờ xử lý', override: 'Điều phối vượt điều kiện (có lý do)', alternative_accepted: 'Khách đồng ý đổi gara',
};
// trực THEO GIỜ ĐĂNG KÝ: trong giờ mở cửa gara tự nhận đơn; tạm ngưng có hạn; chưa khai giờ → bật tay như cũ
const DUTY = { schedule: '🟢 Trong giờ — tự nhận đơn', paused: '⏸ Tạm ngưng', closed: '⚪ Ngoài giờ', manual: 'Chưa khai giờ (bật tay)' };
const STORE_STATUS = { pending: 'Chờ duyệt', active: 'Đang hoạt động', suspended: 'Tạm khóa' };
const SERVICE = { repair: 'Sửa chữa', tire: 'Lốp', battery: 'Ắc quy', tow: 'Kéo xe', diagnostics: 'Kiểm tra lỗi' };
const SOURCE = { store: 'Ảnh do cửa hàng cung cấp', google: 'Ảnh từ Google Maps' };
const ACTOR = { customer: 'khách', staff: 'gara', garage: 'gara', admin: 'điều phối', system: 'hệ thống' };

// Hạn gói: admin chọn NGÀY → lưu 23:59:59.999 giờ Việt Nam (UTC+7) của ngày đó; hiển thị ngược lại theo giờ VN.
const VN_OFFSET = 7 * 3600_000;
const dateToVnEnd = (v) => { if (!v) return null; const [y, m, d] = v.split('-').map(Number); return Date.UTC(y, m - 1, d, 23, 59, 59, 999) - VN_OFFSET; };
const vnDate = (t) => t == null ? '' : new Date(t + VN_OFFSET).toISOString().slice(0, 10);
const fmtVnDate = (t) => { const s = vnDate(t); return s ? s.split('-').reverse().join('/') : ''; };
const planChip = (u) => u.premiumActive
  ? `<span class="chip plan-premium">Premium${u.planExpiresAt ? ` · đến ${fmtVnDate(u.planExpiresAt)}` : ''}</span>`
  : u.plan === 'premium' ? `<span class="chip off">Premium hết hạn ${fmtVnDate(u.planExpiresAt)}</span>` : '<span class="chip off">Free</span>';

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
    setDemoUi(!!state.config.demoMode);
    refreshStoreBadge();
    refreshSosBadge();
    // server chạy mã cũ (đã sửa code mà chưa khởi động lại) → nói rõ, thay vì để các tính năng mới lỗi 404 khó hiểu
    fetch('/api/health').then(r => r.json()).then(h => {
      if (h.stale) toast('⚠ Mã server đã đổi nhưng server CHƯA khởi động lại — tính năng mới có thể lỗi. Tắt rồi chạy lại server.', true);
      // ĐANG XEM MÁY CHỦ NÀO: app gửi tới laptop mà mở admin Render (hoặc ngược lại) = "không thấy SOS / đăng ký"
      const st = h.storage;
      $('#serverInfo').textContent = `Máy chủ: ${location.host}${st ? ` · ${st.server}` : ''}`;
      const bar = $('#storageBanner');
      bar.hidden = !st || st.persistent;
      if (st && !st.persistent) bar.innerHTML = `⚠ <b>Dữ liệu trên máy chủ này là TẠM THỜI</b> (${esc(st.server)} gói free): tài khoản đăng ký, gara, SOS <b>bị xóa khi server ngủ (~15 phút không dùng) hoặc deploy lại</b>. App phải trỏ đúng địa chỉ <b>${esc(location.origin)}</b> thì dữ liệu mới hiện ở đây.`;
    }).catch(() => {});
    clearInterval(state.sosTimer);
    state.sosTimer = setInterval(refreshSosBadge, 15_000);      // dự phòng khi mất realtime
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
    const r = await api('POST', '/api/auth/login', { identifier: f.get('email'), email: f.get('email'), password: f.get('password') });
    if (r.user.role !== 'admin') { $('#loginError').textContent = 'Tài khoản này không có quyền điều phối'; return; }
    state.token = r.token; sessionStorage.setItem('resq.token', r.token);
    boot();
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', logout);
// CHẾ ĐỘ DEMO: cờ tường minh — bật mới có xe ảo (không bao giờ suy luận từ GPS)
function setDemoUi(on) { $('#demoMode').checked = on; $('.demo-toggle').classList.toggle('on', on); }
$('#demoMode').addEventListener('change', guard(async (e) => {
  const r = await api('POST', '/api/admin/settings', { demoMode: e.target.checked });
  setDemoUi(r.demoMode);
  toast(r.demoMode ? 'Đã BẬT chế độ demo: đơn mới chạy xe ảo từ gara được giao, gara mới tự duyệt' : 'Đã TẮT chế độ demo: dùng GPS thật, gara mới chờ duyệt');
}));
async function refreshStoreBadge() {
  try {
    const list = await api('GET', '/api/admin/stores');
    const n = list.filter(x => x.status === 'pending' || x.pending).length;
    $('#storeBadge').hidden = !n; $('#storeBadge').textContent = n;
  } catch { /* bỏ qua */ }
}
// "Đặt lại demo": tập 10 lần vẫn sạch như lần đầu (hủy đơn mở của tài khoản mẫu, dừng xe ảo, bật lại nhận đơn)
$('#demoResetBtn').addEventListener('click', guard(async () => {
  if (!confirm('Đặt lại demo?\n\n• Hủy mọi đơn đang mở của tài khoản mẫu\n• Dừng xe ảo đang chạy\n• Bật lại "Nhận đơn" cho nhân viên mẫu')) return;
  const r = await api('POST', '/api/admin/demo/reset');
  closeDrawer();
  const parts = [`Đã hủy ${r.cancelled.length} đơn`];
  if (r.staffReady.length) parts.push(`sẵn sàng: ${r.staffReady.join(', ')}`);
  if (r.staffOffline.length) parts.push(`chưa mở app: ${r.staffOffline.join(', ')}`);
  toast(`Demo đã sẵn sàng — ${parts.join(' · ')}`);
  emit('order');
}));
const virtualChip = (o) => (o.virtualDrive ? '<span class="chip virtual" title="Server lái xe ảo theo tuyến Goong thật (demo cùng phòng)">XE ẢO</span>' : '');
const storeLine = (o) => (o.store ? `<b>${esc(o.store.name)}</b>${o.store.distanceM != null ? ` · cách khách ${fmtDist(o.store.distanceM)}` : ''}${o.store.etaS ? ` · ~${Math.max(1, Math.round(o.store.etaS / 60))} phút` : ''}<div class="muted small">${esc(o.store.address || '')}</div>` : '');

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
    else if (m.type === 'sos') { onSosMessage(m.sos); }
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
  const pages = { overview: pageOverview, ops: pageOps, orders: pageOrders, stores: pageStores, users: pageUsers, home: pageHome, sos: pageSos };
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
      kpi('Nhân viên gara sẵn sàng', s.staff.available, `${s.staff.busy} đang làm đơn · ${s.staff.total} trực tuyến`),
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
    <div class="page-head"><div><h1>Bản đồ điều hành</h1><div class="muted small">Vị trí nhân viên gara, đơn đang mở và xe đang chạy — cập nhật trực tiếp</div></div></div>
    <div class="ops">
      <div>
        <div class="map-tools">
          <label style="display:flex;flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="heat" style="width:auto"> Bản đồ nhiệt sự cố 30 ngày</label>
          <span class="chip" style="background:var(--good-bg);color:var(--good)">Gara sẵn sàng</span>
          <span class="chip enroute">Gara đang làm đơn</span>
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
        <div>${sosChip(o)} ${virtualChip(o)} ${esc(ISSUE[o.issue] ?? o.issue)} · ${esc(o.customer.name)}</div>
        ${o.store ? `<div class="small">Gara ReFix: ${esc(o.store.name)}</div>` : ''}
        <div class="muted small">${esc(o.address || `${o.location.lat.toFixed(5)}, ${o.location.lng.toFixed(5)}`)}</div>
        <div class="small">${o.staff ? `Gara: ${esc(o.staff.unit || o.staff.name)} · ${esc(o.staff.name)} (${esc(o.staff.vehiclePlate)})` : '<b style="color:var(--critical)">Chưa có gara nhận</b>'}${f ? ` · còn ${fmtDist(f.remainingM)}, ~${Math.max(1, Math.round(f.etaS / 60))} phút` : ''}</div>
        ${o.hold ? `<div class="small" style="color:var(--warning)">⚠ ${esc(o.hold.message)}</div>` : ''}
        <div class="muted small">Tạo ${ago(o.createdAt)}</div></div>`;
    }).join('') : '<div class="empty card">Không có đơn nào đang mở.</div>';
    $('#opsList').querySelectorAll('.order-card').forEach(c => c.onclick = () => openOrder(c.dataset.id));
    if (!map) return;

    syncMarkers('order', orders, o => o.id, o => { const e = document.createElement('div'); e.className = `mk-order ${o.priority === 'sos' ? 'sos' : ''}`; e.title = `${o.id} · ${STATUS[o.status]}`; e.onclick = () => openOrder(o.id); return e; }, o => [o.location.lng, o.location.lat]);
    const now = Date.now();
    // nhân viên gara đang có xe chạy trực tiếp đã hiện bằng mũi tên xe → không vẽ thêm chấm vị trí
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
      const e = document.createElement('div'); e.className = 'mk-veh'; e.title = `${f.simulated ? 'XE ẢO · ' : ''}Xe đơn ${f.orderId} · ${f.speedMps != null ? Math.round(f.speedMps * 3.6) + ' km/h' : ''}${f.timeScale ? ` · tua nhanh ×${f.timeScale}` : ''}`;
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
    <div class="table-wrap"><table><thead><tr><th>Mã</th><th>Trạng thái</th><th>Khách</th><th>Sự cố</th><th>Gara</th><th>Địa chỉ</th><th>Tạo lúc</th></tr></thead><tbody id="rows"></tbody></table></div>
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
      <div class="head"><div><h1 class="mono">${esc(o.id)}</h1><div>${statusChip(o.status)} ${sosChip(o)} ${virtualChip(o)}</div></div><button class="btn ghost" id="closeDrawer" aria-label="Đóng">✕</button></div>
      ${o.hold && o.status === 'requested' ? `<div class="hold"><b>Chưa tự giao</b> — ${esc(o.hold.message)}${o.hold.best ? `<div class="small">Gợi ý: <b>${esc(o.hold.best.name)}</b> · ${fmtDist(o.hold.best.distanceM)} · ~${o.hold.best.etaMin} phút</div>` : ''}</div>` : ''}
      ${o.injured ? '<div class="alert critical"><span class="tag">AN TOÀN</span><span>Có người bị thương: xác nhận đã gọi 115 / hướng dẫn khách sơ cứu, không di chuyển nạn nhân.</span></div>' : ''}
      <dl class="kv">
        <dt>Khách</dt><dd>${esc(o.customer.name)} · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></dd>
        <dt>Sự cố</dt><dd>${esc(ISSUE[o.issue] ?? o.issue)} · <span class="mono">${esc(o.vehiclePlate)}</span></dd>
        <dt>Vị trí</dt><dd>${esc(o.address || '—')}<div class="muted small mono">${o.location.lat.toFixed(6)}, ${o.location.lng.toFixed(6)}${o.location.accuracyM != null ? ` · sai số ±${Math.round(o.location.accuracyM)} m` : ''}</div></dd>
        <dt>Ghi chú</dt><dd>${esc(o.note || '—')}</dd>
        ${o.requestedStore ? `<dt>Khách chọn</dt><dd><b>${esc(o.requestedStore.name)}</b> <span class="chip">đối tác</span>${o.store && o.store.id !== o.requestedStore.id ? ' <span class="chip off">khác gara được giao — xem nhật ký</span>' : ''}</dd>` : o.place ? `<dt>Khách chọn</dt><dd><b>${esc(o.place.name)}</b> <span class="muted small">(chưa là đối tác — không nhận đơn qua app)</span></dd>` : ''}
        ${o.store ? `<dt>Gara được giao</dt><dd>${storeLine(o)}${o.virtualDrive ? '<div class="muted small">Chế độ demo: server lái xe ảo từ ĐÚNG gara này theo tuyến Goong thật (~48–90 giây).</div>' : ''}</dd>` : ''}
        <dt>Gara</dt><dd>${o.staff ? `${esc(o.staff.name)} · ${esc(o.staff.vehiclePlate)} · <a href="tel:${esc(o.staff.phone)}">${esc(o.staff.phone)}</a>` : '<span class="muted">Chưa điều phối</span>'}</dd>
        ${o.cancelReason ? `<dt>Lý do hủy</dt><dd>${esc(o.cancelReason)}</dd>` : ''}
        ${o.rating ? `<dt>Đánh giá</dt><dd>${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)}</dd>` : ''}
      </dl>
      <div class="actions">
        ${active && ['requested', 'assigned'].includes(o.status) ? '<button class="btn primary" id="aAssign">Điều phối gara…</button>' : ''}
        ${active && ['assigned', 'enroute'].includes(o.status) ? '<button class="btn" id="aUnassign">Rút đơn khỏi gara</button>' : ''}
        ${o.status === 'arrived' ? '<button class="btn" id="aStart">Bắt đầu hỗ trợ</button>' : ''}
        ${o.status === 'in_service' ? '<button class="btn" id="aComplete">Hoàn thành</button>' : ''}
        ${active ? '<button class="btn" id="aEdit">Sửa</button><button class="btn danger" id="aCancel">Hủy đơn</button>' : ''}
        ${o.status === 'cancelled' ? '<button class="btn danger" id="aDelete">Xóa đơn</button>' : ''}
      </div>
      <div id="cands"></div>
      <div id="nearPlaces"></div>
      <div><h2>Hành trình xe ${track.length ? `<span class="muted small">(${track.length} điểm, lưu mỗi 10 giây)</span>` : ''}</h2><div class="mini-map" id="miniMap"></div></div>
      <div><h2>Nhật ký</h2><ul class="timeline">${events.map(e => `<li><b>${esc(EVENT[e.type] ?? e.type)}</b> <span class="muted small">· ${fmtTime(e.at)} · ${esc(ACTOR[e.actorRole] ?? e.actorRole)}</span>${e.data?.reason ? `<div class="muted small">${esc(e.data.reason)}</div>` : ''}${e.data?.message ? `<div class="muted small">${esc(e.data.message)}</div>` : ''}${e.data?.to ? `<div class="muted small">${esc(e.data.from ?? '—')} → ${esc(e.data.to)}</div>` : ''}${e.data?.staffName ? `<div class="muted small">→ ${esc(e.data.staffName)}${e.data.storeName ? ` · xuất phát từ ${esc(e.data.storeName)}` : ''}${e.data.virtualDrive ? ' · xe ảo' : ''}</div>` : ''}</li>`).join('')}</ul></div>`;
    $('#closeDrawer').onclick = closeDrawer;
    const act = (sel, fn) => { const b = $(sel, d); if (b) b.onclick = guard(fn); };
    act('#aAssign', () => showStoreOptions(o));
    act('#aUnassign', async () => { const r = prompt('Lý do rút đơn (xe hỏng, gara mất liên lạc…)'); if (r === null) return; await api('POST', `/api/admin/orders/${o.id}/unassign`, { reason: r }); toast('Đã đưa đơn về hàng chờ'); });
    act('#aStart', async () => { await api('POST', `/api/orders/${o.id}/start`); });
    act('#aComplete', async () => { await api('POST', `/api/orders/${o.id}/complete`, { note: 'Điều phối xác nhận hoàn thành' }); });
    act('#aCancel', async () => { const r = prompt('Lý do hủy đơn'); if (r === null) return; await api('POST', `/api/orders/${o.id}/cancel`, { reason: r }); toast('Đã hủy đơn'); });
    act('#aDelete', async () => { if (!confirm(`Xóa vĩnh viễn đơn ${o.id}?`)) return; await api('DELETE', `/api/admin/orders/${o.id}`); closeDrawer(); toast('Đã xóa đơn'); emit('order'); });
    act('#aEdit', () => editOrderModal(o));
    if (active) loadNearPlaces(o);

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
/** Gara phù hợp nhất quanh vị trí khách (cùng thuật toán xếp hạng của app). */
async function loadNearPlaces(o) {
  const box = $('#nearPlaces');
  if (!box) return;
  try {
    const { items } = await api('GET', `/api/admin/orders/${encodeURIComponent(o.id)}/places`);
    if (!items.length) { box.innerHTML = '<h2>Gara gần khách</h2><div class="empty">Chưa có dữ liệu gara quanh vị trí này.</div>'; return; }
    box.innerHTML = '<h2>Gara phù hợp gần khách</h2>' + items.slice(0, 5).map((p, i) => `
      <div class="cand">
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${p.images[0] ? `<img src="${esc(p.images[0])}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px">` : ''}
          <div><b>${i + 1}. ${esc(p.name)}</b>${p.trust === 'low' ? ' <span class="chip off">chưa xác minh</span>' : ''}
          <div class="muted small">${esc(p.reasons.join(' · '))}</div>
          <div class="muted small">${esc(p.address)}</div></div>
        </div>
        ${p.phone ? `<a class="btn small" href="tel:${esc(p.phone)}">Gọi</a>` : ''}
      </div>`).join('');
  } catch (e) {
    box.innerHTML = `<div class="muted small">Không tải được gara gần khách: ${esc(e.message)}</div>`;
  }
}

function closeDrawer() { $('#drawer').hidden = true; drawerOrderId = null; drawerMap?.remove(); drawerMap = null; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden && !$('#modal').open) closeDrawer(); });

async function showCandidates(o) {
  const box = $('#cands');
  box.innerHTML = '<div class="muted small">Đang tính nhân viên gara phù hợp…</div>';
  const cands = await api('GET', `/api/admin/orders/${o.id}/candidates`);
  box.innerHTML = `<h2>Nhân viên gara đề xuất</h2>` + (cands.length ? cands.map(c => `<div class="cand"><div><b>${esc(c.name)}</b>${c.declined ? ' <span class="chip off">đã từ chối / hết giờ</span>' : ''}<div class="muted small">cách ${fmtDist(c.distanceM)} · ETA ~${Math.max(1, Math.round(c.etaS / 60))} phút ${c.etaSource === 'goong' ? '(Goong, đường thật)' : '(ước lượng)'} · vị trí ${c.presenceAgeS} giây trước</div></div><button class="btn small primary" data-id="${c.staffId}">${c.declined ? 'Giao lại' : 'Giao'}</button></div>`).join('')
    : '<div class="empty">Không có nhân viên gara sẵn sàng trong bán kính 30 km (đang bận, tắt nhận đơn hoặc mất tín hiệu). Demo bị kẹt? Bấm <b>Đặt lại demo</b> ở thanh bên.</div>');
  box.querySelectorAll('button[data-id]').forEach(b => b.onclick = guard(async () => {
    await api('POST', `/api/admin/orders/${o.id}/assign`, { staffId: Number(b.dataset.id) });
    toast('Đã giao đơn — chờ gara nhận (90 giây)');
  }));
}

/** Gara cho đơn: đủ điều kiện? trong cam kết ETA? — giao vượt điều kiện bắt buộc lý do (ghi nhật ký). */
async function showStoreOptions(o) {
  const box = $('#cands');
  box.innerHTML = '<div class="muted small">Đang đánh giá các gara…</div>';
  const opts = await api('GET', `/api/admin/orders/${o.id}/stores`);
  box.innerHTML = '<h2>Gara phù hợp</h2>' + (opts.length ? opts.map(x => `<div class="opt">
      <div><b>${esc(x.name)}</b> ${x.requested ? '<span class="chip">khách chọn</span>' : ''}
        ${x.eligible ? (x.withinCommitment ? '<span class="chip completed">đủ điều kiện</span>' : '<span class="chip off">ngoài vùng phủ</span>') : '<span class="chip off">chưa đủ điều kiện</span>'}
        <div class="muted small">${esc(x.distanceText)} · ETA ~${esc(x.etaText)} · ${x.onDuty} người đang trực · ${x.open === 'closed' ? 'đang đóng cửa' : x.open === 'unknown' ? 'chưa khai giờ mở cửa' : 'đang mở'}</div>
        ${x.problems.length ? `<div class="small why">${esc(x.problems.join(' · '))}</div>` : ''}
      </div>
      <button class="btn small ${x.overrideReason ? '' : 'primary'}" data-id="${esc(x.storeId)}" ${x.staffId ? '' : 'disabled'}>${x.overrideReason ? 'Giao (cần lý do)' : 'Giao'}</button>
    </div>`).join('') : '<div class="empty">Chưa có gara đối tác nào đang hoạt động. Duyệt gara ở trang "Gara đối tác".</div>');
  box.querySelectorAll('button[data-id]').forEach(b => b.onclick = guard(async () => {
    const x = opts.find(y => y.storeId === b.dataset.id);
    let reason;
    if (x.overrideReason) {
      reason = prompt(`Giao vượt điều kiện: ${x.overrideReason}\n\nLý do (ghi vào nhật ký, khách sẽ thấy gara mới):`);
      if (!reason) return;
    }
    await api('POST', `/api/admin/orders/${o.id}/assign`, { storeId: x.storeId, reason });
    toast(`Đã giao cho ${x.name} — chờ nhân viên nhận (90 giây)`);
  }));
}

// ======================= GARA ĐỐI TÁC =======================
function pageStores(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Gara đối tác</h1><div class="muted small">Gara là đơn vị được điều phối. Địa chỉ do gara tự sửa phải được duyệt trước khi dùng để tính khoảng cách.</div></div></div>
    <div class="table-wrap"><table><thead><tr><th>Gara</th><th>Trạng thái</th><th>Địa chỉ (dùng để điều phối)</th><th>Dịch vụ · giờ mở cửa</th><th>Ảnh</th><th>Nhận đơn</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const load = guard(async () => {
    const list = await api('GET', '/api/admin/stores');
    $('#rows').innerHTML = list.length ? list.map(x => `<tr data-id="${esc(x.id)}">
      <td><b>${esc(x.name)}</b>${x.parentName ? `<div class="muted small">Chi nhánh của ${esc(x.parentName)}</div>` : ''}<div class="muted small">${esc(x.phone || '')}${x.email ? ' · ' + esc(x.email) : ''}</div>${x.ownerEmail ? `<div class="muted small">Chủ: ${esc(x.ownerName || '')}${x.ownerUsername ? ` · @${esc(x.ownerUsername)}` : ''}${x.ownerPhone ? ` · ${esc(x.ownerPhone)}` : ''} · ${esc(x.ownerEmail)}</div>` : ''}</td>
      <td><span class="chip ${x.status === 'active' ? 'completed' : 'off'}">${esc(STORE_STATUS[x.status] ?? x.status)}</span>${x.verifiedBy ? `<div class="muted small">duyệt: ${esc(x.verifiedBy === 'demo-auto' ? 'tự duyệt (chế độ demo)' : x.verifiedBy)}</div>` : ''}</td>
      <td class="small">${esc(x.address)}<div class="muted mono">${x.pos[1].toFixed(5)}, ${x.pos[0].toFixed(5)}</div>
        ${x.pending ? `<div class="pending-addr"><b>Chờ xác minh:</b> ${esc(x.pending.address)}<div class="muted mono">${x.pending.pos[1].toFixed(5)}, ${x.pending.pos[0].toFixed(5)} · cách địa chỉ cũ ${fmtDist(distM(x.pos, x.pending.pos))}</div>
          <button class="btn small primary" data-act="approve">Duyệt địa chỉ mới</button> <button class="btn small" data-act="reject">Từ chối</button></div>` : ''}</td>
      <td class="small">${(x.services || []).map(k => esc(SERVICE[k] ?? k)).join(', ') || '—'}<div class="muted">${(x.hoursLines || []).slice(0, 2).map(esc).join('<br>') || 'chưa khai giờ mở cửa'}</div></td>
      <td><div class="thumbs">${(x.images || []).slice(0, 3).map(i => `<figure><img src="${esc(i.url)}" alt=""><figcaption>${esc(i.source === 'store' ? 'cửa hàng' : 'Google')}</figcaption></figure>`).join('') || '<span class="muted small">—</span>'}</div></td>
      <td class="small">${DUTY[x.dutyMode] ?? ''}${x.dutyMode === 'paused' && x.pausedUntil ? ` tới ${fmtTime(x.pausedUntil)}` : ''}<div class="muted">${x.staffCount} người nhận đơn</div></td>
      <td style="white-space:nowrap">${x.status === 'pending' ? '<button class="btn small primary" data-act="approve">Duyệt gara</button> ' : ''}${x.status === 'suspended' ? '<button class="btn small" data-act="activate">Mở lại</button>' : '<button class="btn small" data-act="suspend">Tạm khóa</button>'}</td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">Chưa có gara nào.</td></tr>';
    $('#rows').querySelectorAll('button[data-act]').forEach(b => b.onclick = guard(async () => {
      const id = b.closest('tr').dataset.id;
      const act = b.dataset.act;
      if (act === 'approve') await api('POST', `/api/admin/stores/${encodeURIComponent(id)}/approve`);
      if (act === 'reject') await api('POST', `/api/admin/stores/${encodeURIComponent(id)}/reject-address`);
      if (act === 'suspend') { if (!confirm('Tạm khóa gara này? Gara sẽ không nhận đơn mới.')) return; await api('POST', `/api/admin/stores/${encodeURIComponent(id)}/status`, { status: 'suspended' }); }
      if (act === 'activate') await api('POST', `/api/admin/stores/${encodeURIComponent(id)}/status`, { status: 'active' });
      toast('Đã cập nhật gara'); load(); refreshStoreBadge();
    }));
  });
  load();
  const t = setInterval(load, 15_000);
  return () => clearInterval(t);
}
const distM = (a, b) => { const R = 6371008.8, r = d => d * Math.PI / 180; const x = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

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
    <div class="page-head"><div><h1>Người dùng</h1><div class="muted small">Khách hàng, gara và điều phối viên</div></div><button class="btn primary" id="newUser">+ Thêm người dùng</button></div>
    <div class="toolbar"><input id="q" placeholder="Tìm tên, email, tài khoản, SĐT, biển số" />
      <select id="role"><option value="">Mọi vai trò</option>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Vai trò</th><th>Email · tài khoản</th><th>SĐT</th><th>Xe / Đơn vị</th><th>Gói</th><th>Trạng thái</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager"><span class="muted small" id="pageInfo"></span><button class="btn small" id="prev">‹ Trước</button><button class="btn small" id="next">Sau ›</button></div>`;
  const load = guard(async () => {
    const qs = new URLSearchParams({ limit, offset, ...($('#role').value ? { role: $('#role').value } : {}), ...($('#q').value ? { q: $('#q').value } : {}) });
    const { items, total } = await api('GET', `/api/admin/users?${qs}`);
    $('#rows').innerHTML = items.length ? items.map(u => `<tr data-id="${u.id}">
      <td><b>${esc(u.name)}</b></td><td><span class="chip role-${esc(u.role)}">${esc(ROLE[u.role])}</span></td>
      <td>${esc(u.email)}${u.username ? `<div class="muted small mono">@${esc(u.username)}</div>` : ''}</td><td>${esc(u.phone || '—')}</td>
      <td class="small"><span class="mono">${esc(u.vehiclePlate || '')}</span> ${esc(u.unit || '')}</td>
      <td>${planChip(u)}</td>
      <td>${u.active ? '<span class="chip completed">Hoạt động</span>' : '<span class="chip off">Đã khóa</span>'}</td>
      <td style="white-space:nowrap"><button class="btn small" data-act="edit">Sửa</button> <button class="btn small" data-act="toggle">${u.active ? 'Khóa' : 'Mở khóa'}</button> <button class="btn small danger" data-act="del">Xóa</button></td></tr>`).join('')
      : '<tr><td colspan="8" class="empty">Không có người dùng phù hợp.</td></tr>';
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
    <div class="row2"><label>Tài khoản đăng nhập (không bắt buộc)<input name="username" maxlength="24" placeholder="vd: minh.nguyen" autocapitalize="none" spellcheck="false" value="${esc(u?.username)}"></label>
      <label>Tên gara / đơn vị<input name="unit" maxlength="120" value="${esc(u?.unit)}"></label></div>
    <div class="row2"><label>Gói<select name="plan"><option value="free" ${u?.plan !== 'premium' ? 'selected' : ''}>Free</option><option value="premium" ${u?.plan === 'premium' ? 'selected' : ''}>Premium</option></select></label>
      <label>Hết hạn (để trống = không hết hạn)<input name="planExpiresAt" type="date" value="${esc(vnDate(u?.planExpiresAt))}"></label></div>
    <p class="muted small">Gói do tổng đài đặt tay — ứng dụng chưa có thanh toán. Hạn tính tới hết ngày (giờ Việt Nam).</p>
    <label>${u ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu (tối thiểu 8 ký tự)'}<input name="password" type="password" minlength="8" ${u ? '' : 'required'} autocomplete="new-password"></label>
    <p class="error" id="ferr"></p>
    <div class="actions"><button class="btn primary" value="ok">${u ? 'Lưu' : 'Tạo'}</button><button class="btn" value="cancel" formnovalidate>Hủy</button></div></form>`;
  dlg.showModal();
  $('#f', dlg).onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (!body.password) delete body.password;
    body.username = body.username.trim();
    body.planExpiresAt = body.plan === 'premium' ? dateToVnEnd(body.planExpiresAt) : null;
    try {
      if (u) await api('PATCH', `/api/admin/users/${u.id}`, body); else await api('POST', '/api/admin/users', body);
      dlg.close(); toast(u ? 'Đã lưu' : 'Đã tạo người dùng'); done();
    } catch (err) { $('#ferr', dlg).textContent = err.message; }
  };
}

// ======================= TRANG CHỦ APP (giá xăng, khuyến mãi) =======================
const FUELS = ['RON 95-III', 'E5 RON 92', 'Dầu DO 0,05S', 'Dầu DO 0,001S'];
function pageHome(view) {
  view.innerHTML = `
    <div class="page-head"><div><h1>Trang chủ ứng dụng</h1><div class="muted small">Nội dung khách thấy trên Trang chủ. Để trống = app ẩn hẳn khối đó (không hiện số liệu mẫu).</div></div></div>
    <form id="hf" class="home-form">
      <section class="card"><h2>Giá xăng</h2>
        <p class="muted small" id="gasInfo"></p>
        <div class="table-wrap"><table><thead><tr><th>Nhiên liệu</th><th>Giá (đồng)</th><th>Đơn vị</th></tr></thead><tbody id="gasRows"></tbody></table></div>
        <p class="muted small">Để trống cả 4 giá = tắt khối giá xăng. Giá quá cũ sẽ tự ẩn trên app — hãy cập nhật sau mỗi kỳ điều chỉnh giá.</p>
      </section>
      <section class="card"><h2>Khuyến mãi / thông báo <span class="muted small">(tối đa 5, app hiện 3 mục đầu)</span></h2>
        <div id="promoRows"></div>
        <button type="button" class="btn small" id="addPromo">+ Thêm khuyến mãi</button>
      </section>
      <p class="error" id="herr"></p>
      <div class="actions"><button class="btn primary" type="submit">Lưu nội dung</button> <span class="muted small" id="savedAt"></span></div>
    </form>`;
  let promos = [];
  const readPromos = () => {
    promos = [...$('#promoRows').querySelectorAll('fieldset.promo')].map(fs => {
      const v = (k) => fs.querySelector(`[data-k="${k}"]`).value.trim();
      return { id: promos[Number(fs.dataset.i)]?.id, title: v('title'), body: v('body'), ctaLabel: v('ctaLabel') || null, ctaUrl: v('ctaUrl') || null, expiresAt: dateToVnEnd(v('expiresAt')) };
    });
  };
  const renderPromos = () => {
    $('#promoRows').innerHTML = promos.length ? promos.map((p, i) => `<fieldset class="promo" data-i="${i}">
      <div class="row2"><label>Tiêu đề<input data-k="title" maxlength="80" required value="${esc(p.title)}"></label>
        <label>Hết hạn (để trống = không hết hạn)<input data-k="expiresAt" type="date" value="${esc(vnDate(p.expiresAt))}"></label></div>
      <label>Nội dung<textarea data-k="body" maxlength="200" rows="2">${esc(p.body)}</textarea></label>
      <div class="row2"><label>Nhãn nút<input data-k="ctaLabel" maxlength="30" placeholder="vd: Xem chi tiết" value="${esc(p.ctaLabel)}"></label>
        <label>Link (https://…)<input data-k="ctaUrl" type="url" maxlength="500" pattern="https://.*" placeholder="https://" value="${esc(p.ctaUrl)}"></label></div>
      ${p.expiresAt && p.expiresAt < Date.now() ? '<p class="muted small">Đã hết hạn — app không hiển thị.</p>' : ''}
      <button type="button" class="btn small danger" data-del="${i}">Xóa</button></fieldset>`).join('')
      : '<p class="muted small">Chưa có khuyến mãi — app ẩn khối "Dành cho bạn".</p>';
    $('#promoRows').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { readPromos(); promos.splice(Number(b.dataset.del), 1); renderPromos(); });
  };
  const show = (c) => {
    const items = new Map((c.gas?.items ?? []).map(x => [x.label, x]));
    const extra = (c.gas?.items ?? []).filter(x => !FUELS.includes(x.label)).map(x => x.label);
    $('#gasRows').innerHTML = [...FUELS, ...extra].slice(0, 4).map(label => {
      const it = items.get(label);
      return `<tr><td><input data-g="label" value="${esc(label)}" maxlength="40"></td>
        <td><input data-g="price" type="number" min="1" max="200000" step="1" value="${it ? it.price : ''}" placeholder="vd: 23150"></td>
        <td><input data-g="unit" maxlength="20" value="${esc(it?.unit ?? 'đ/lít')}"></td></tr>`;
    }).join('');
    const age = c.gas ? (Date.now() - c.gas.updatedAt) / 86_400_000 : null;
    $('#gasInfo').innerHTML = c.gas
      ? `Giá cập nhật lúc <b>${fmtTime(c.gas.updatedAt)}</b>${age > c.gasMaxAgeDays ? ` — <b style="color:var(--critical)">đã quá ${c.gasMaxAgeDays} ngày, app đang ẩn khối giá xăng</b>` : ''}`
      : 'Chưa nhập giá — app không hiện khối giá xăng.';
    promos = c.promos.map(p => ({ ...p }));
    renderPromos();
    $('#savedAt').textContent = c.updatedAt ? `Lưu lần cuối ${fmtTime(c.updatedAt)}` : '';
  };
  $('#addPromo').onclick = () => {
    readPromos();
    if (promos.length >= 5) return toast('Tối đa 5 khuyến mãi', true);
    promos.push({ title: '', body: '', ctaLabel: '', ctaUrl: '', expiresAt: null });
    renderPromos();
  };
  $('#hf').onsubmit = async (e) => {
    e.preventDefault();
    readPromos();
    const items = [...$('#gasRows').querySelectorAll('tr')].map(tr => {
      const g = (k) => tr.querySelector(`[data-g="${k}"]`).value.trim();
      return { label: g('label'), price: g('price') === '' ? null : Number(g('price')), unit: g('unit') || 'đ/lít' };
    }).filter(x => x.price != null);
    try {
      const saved = await api('PUT', '/api/admin/home-content', { gas: { items }, promos });
      $('#herr').textContent = ''; show(saved); toast('Đã lưu nội dung Trang chủ');
    } catch (err) { $('#herr').textContent = err.message; }
  };
  guard(async () => show(await api('GET', '/api/admin/home-content')))();
}

// ======================= SOS KHẨN CẤP =======================
// SOS đi thẳng tới tổng đài (không phải đơn gara). Quy trình gợi ý: Tiếp nhận → gọi nạn nhân → báo 115 nếu có nguy
// hiểm / bị thương → báo người thân → điều cứu hộ nếu cần kéo / sửa xe → đóng kèm kết quả. Mọi bước được ghi nhật ký,
// nạn nhân thấy ngay trên app. Chưa có cổng SMS / API 115: tổng đài gọi / nhắn từ máy mình bằng nội dung soạn sẵn.
const SOS_STATUS = { open: 'CHƯA TIẾP NHẬN', acknowledged: 'Đang xử lý', resolved: 'Đã đóng', cancelled: 'Nạn nhân báo an toàn' };
const SOS_EVENT = {
  created: 'Phát tín hiệu SOS', acknowledged: 'Tổng đài tiếp nhận', called_user: 'Đã gọi nạn nhân', reported_115: 'Đã báo 115',
  notified_contact: 'Đã báo người thân', dispatched_rescue: 'Điều cứu hộ', resolved: 'Đóng SOS', cancelled: 'Nạn nhân báo an toàn', note: 'Ghi chú',
};
const SOS_SOURCE = { hold: 'giữ nút SOS', crash: 'phát hiện va chạm', manual: 'tổng đài tạo' };
const sosStatusChip = (s) => `<span class="chip ${s.status === 'open' ? 'sos' : s.status === 'acknowledged' ? 'assigned' : 'completed'}">${esc(SOS_STATUS[s.status] ?? s.status)}</span>`;
const smsHref = (phone, body) => `sms:${encodeURIComponent(phone.replace(/\s/g, ''))}?body=${encodeURIComponent(body)}`;

// Còi báo + banner trên MỌI trang khi có SOS chưa tiếp nhận (không phụ thuộc đang mở trang nào)
let sosOpenCount = 0;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* trình duyệt chặn âm thanh khi chưa tương tác — banner vẫn hiện */ }
}
async function refreshSosBadge() {
  try {
    const list = await api('GET', '/api/admin/sos');
    const open = list.filter(x => x.status === 'open');
    sosOpenCount = open.length;
    $('#sosBadge').hidden = !list.length; $('#sosBadge').textContent = list.length;
    const bar = $('#sosBanner');
    bar.hidden = !open.length;
    if (open.length) bar.innerHTML = `🚨 <b>${open.length} tín hiệu SOS CHƯA TIẾP NHẬN</b> — ${open.map(x => esc(x.user?.name ?? x.id)).join(', ')} · <u>Mở ngay</u>`;
  } catch { /* bỏ qua */ }
}
function onSosMessage(s) {
  if (s.status === 'open' && !s.acknowledgedAt) { beep(); toast(`🚨 SOS từ ${s.user?.name ?? 'người dùng'} — cần tiếp nhận ngay`, true); }
  refreshSosBadge();
  emit('sos');
}

function pageSos(view) {
  let selected = (location.hash.split('?id=')[1] || '') || null;
  let showAll = false;
  view.innerHTML = `
    <div class="page-head"><div><h1>SOS khẩn cấp</h1><div class="muted small">Tín hiệu SOS đến thẳng tổng đài. Tiếp nhận → gọi nạn nhân → báo 115 nếu nguy hiểm → báo người thân → điều cứu hộ nếu cần → đóng kèm kết quả.</div></div>
      <label class="small"><input type="checkbox" id="sosAll"> Hiện cả SOS đã đóng</label></div>
    <div class="sos-layout"><div class="table-wrap"><table><thead><tr><th>Mã</th><th>Trạng thái</th><th>Nạn nhân</th><th>Vị trí</th><th>Lúc</th></tr></thead><tbody id="sosRows"></tbody></table></div>
    <section id="sosDetail" class="card sos-detail"><p class="muted">Chọn một tín hiệu SOS để xử lý.</p></section></div>`;
  const loadList = guard(async () => {
    const list = await api('GET', `/api/admin/sos${showAll ? '?status=all' : ''}`);
    $('#sosRows').innerHTML = list.length ? list.map(s => `<tr data-id="${esc(s.id)}" class="${s.id === selected ? 'selected' : ''}${s.status === 'open' ? ' sos-row-open' : ''}">
      <td class="mono">${esc(s.id)}</td><td>${sosStatusChip(s)}</td>
      <td><b>${esc(s.user?.name ?? '—')}</b><div class="muted small">${esc(s.user?.phone || '')}</div></td>
      <td class="small">${s.location ? `${esc(s.address || '')}<div class="muted mono">${s.location.lat.toFixed(5)}, ${s.location.lng.toFixed(5)}</div>` : '<b style="color:var(--critical)">Chưa có GPS</b>'}</td>
      <td class="small">${ago(s.createdAt)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${showAll ? 'Chưa có tín hiệu SOS nào.' : 'Không có SOS đang mở.'}</td></tr>`;
    $('#sosRows').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { selected = tr.dataset.id; loadList(); loadDetail(); });
  });
  const act = (path, body) => guard(async () => { await api('POST', `/api/admin/sos/${encodeURIComponent(selected)}/${path}`, body); toast('Đã ghi nhận'); await loadDetail(); loadList(); refreshSosBadge(); });
  const loadDetail = guard(async () => {
    const box = $('#sosDetail');
    if (!selected) return;
    const s = await api('GET', `/api/admin/sos/${encodeURIComponent(selected)}`);
    const active = s.status === 'open' || s.status === 'acknowledged';
    const done = (type, pred = () => true) => s.events.find(e => e.type === type && pred(e));
    const loc = s.location;
    box.innerHTML = `
      <div class="sos-head"><div><h2>${esc(s.id)} ${sosStatusChip(s)}</h2>
        <div class="muted small">Nguồn: ${esc(SOS_SOURCE[s.source] ?? s.source)} · phát lúc ${fmtTime(s.createdAt)}${s.handledBy ? ` · người xử lý: ${esc(s.handledBy)}` : ''}</div></div>
        ${s.status === 'open' ? '<button class="btn primary big" id="sAck">TIẾP NHẬN</button>' : ''}</div>

      <div class="sos-grid">
        <div><h3>Nạn nhân</h3>
          <p><b>${esc(s.user?.name ?? '—')}</b>${s.user?.phone ? ` · <a href="tel:${esc(s.user.phone)}">${esc(s.user.phone)}</a>` : ' · <span class="muted">không có SĐT</span>'}</p>
          ${s.vehiclePlate ? `<p class="small">Xe: <span class="mono">${esc(s.vehiclePlate)}</span></p>` : ''}
          ${active ? `<button class="btn small" id="sCalled">${done('called_user') ? '✓ Đã gọi — gọi lại' : 'Đánh dấu đã gọi nạn nhân'}</button>` : ''}
          ${s.history.length ? `<p class="muted small">SOS trước đó: ${s.history.map(x => `${esc(x.id)} (${esc(SOS_STATUS[x.status] ?? x.status)})`).join(', ')}</p>` : ''}
        </div>
        <div><h3>Vị trí</h3>
          ${loc ? `<p>${esc(s.address || '(chưa có địa chỉ)')}</p>
            <p class="mono small">${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}<br>${esc(s.dms)}${loc.accuracyM != null ? `<br>sai số ±${Math.round(loc.accuracyM)} m` : ''} · cập nhật ${ago(loc.at)}</p>
            <a class="btn small" href="${esc(s.mapsUrl)}" target="_blank" rel="noopener">Mở bản đồ</a>`
            : '<p style="color:var(--critical)"><b>Chưa có GPS</b> — gọi nạn nhân hỏi địa chỉ / mốc gần nhất.</p>'}
        </div>
      </div>

      <div class="sos-block"><h3>Báo 115 ${done('reported_115') ? `<span class="chip completed">đã báo ${fmtTime(done('reported_115').at)}</span>` : ''}</h3>
        <p class="muted small">Chưa có kết nối tự động với 115 — gọi <a href="tel:115"><b>115</b></a> và đọc nội dung dưới đây, rồi đánh dấu đã báo.</p>
        <textarea readonly rows="5" id="s115">${esc(s.scripts?.call115 ?? '')}</textarea>
        <div class="actions"><button class="btn small" data-copy="#s115">Sao chép</button>
          ${active ? '<input id="s115ref" placeholder="Người tiếp nhận / mã cuộc gọi (không bắt buộc)" maxlength="80"><button class="btn small primary" id="s115done">Đánh dấu đã báo 115</button>' : ''}</div>
      </div>

      <div class="sos-block"><h3>Người thân (lúc phát SOS)</h3>
        ${s.contacts.length ? `<textarea readonly rows="3" id="sSms">${esc(s.scripts?.contactSms ?? '')}</textarea><div class="actions"><button class="btn small" data-copy="#sSms">Sao chép tin nhắn</button></div>
          <ul class="sos-contacts">${s.contacts.map(c => {
            const d = done('notified_contact', e => e.data.contactId === c.id);
            return `<li><b>${esc(c.name)}</b> <span class="muted small">${esc(c.relation)}${c.shareLocation ? '' : ' · không nhận vị trí'}</span>
              <div><a class="btn small" href="tel:${esc(c.phone)}">Gọi ${esc(c.phone)}</a> <a class="btn small" href="${smsHref(c.phone, s.scripts?.contactSms ?? '')}">Nhắn tin</a>
              ${active ? `<button class="btn small" data-notify="${esc(c.id)}" data-ch="call">Đã gọi</button> <button class="btn small" data-notify="${esc(c.id)}" data-ch="sms">Đã nhắn</button>` : ''}
              ${d ? `<span class="chip completed">đã báo ${fmtTime(d.at)}</span>` : ''}</div></li>`;
          }).join('')}</ul>`
          : '<p class="muted small">Nạn nhân chưa đăng ký người thân nào.</p>'}
      </div>

      <div class="sos-block"><h3>Cứu hộ xe</h3>
        ${s.rescueOrderId ? `<p>Đã điều cứu hộ: <a href="#/orders" data-order="${esc(s.rescueOrderId)}" class="mono">${esc(s.rescueOrderId)}</a></p>`
          : active ? `<p class="muted small">Chỉ khi cần kéo / sửa xe — tạo đơn ưu tiên SOS tại vị trí này, hệ thống tìm gara phù hợp.</p>
            <div class="actions"><select id="sIssue">${Object.entries(ISSUE).map(([k, v]) => `<option value="${k}" ${k === 'tow' ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <button class="btn small" id="sDispatch" ${loc ? '' : 'disabled title="Chưa có vị trí"'}>Điều cứu hộ</button></div>` : '<p class="muted small">Không điều cứu hộ.</p>'}
      </div>

      ${active ? `<div class="sos-block"><h3>Ghi chú / đóng SOS</h3>
        <textarea id="sNote" rows="2" maxlength="500" placeholder="Ghi chú nội bộ, hoặc kết quả xử lý khi đóng (vd. Nạn nhân an toàn, 115 đã tới hiện trường)"></textarea>
        <div class="actions"><button class="btn small" id="sAddNote">Lưu ghi chú</button><button class="btn small danger" id="sResolve">Đóng SOS (ghi kết quả)</button></div></div>`
        : s.resolution ? `<div class="sos-block"><h3>Kết quả</h3><p>${esc(s.resolution)}</p></div>` : ''}

      <div class="sos-block"><h3>Nhật ký</h3><ul class="timeline">${s.events.map(e => `<li><b>${esc(SOS_EVENT[e.type] ?? e.type)}</b> <span class="muted small">· ${fmtTime(e.at)}</span>
        ${e.data?.name ? `<div class="muted small">${esc(e.data.relation || '')} ${esc(e.data.name)} (${e.data.channel === 'sms' ? 'nhắn tin' : 'gọi'})</div>` : ''}
        ${e.data?.ref ? `<div class="muted small">${esc(e.data.ref)}</div>` : ''}${e.data?.note ? `<div class="muted small">${esc(e.data.note)}</div>` : ''}
        ${e.data?.resolution ? `<div class="muted small">${esc(e.data.resolution)}</div>` : ''}${e.data?.orderId ? `<div class="muted small">Đơn ${esc(e.data.orderId)}</div>` : ''}
        ${e.data?.reason ? `<div class="muted small">${esc(e.data.reason)}</div>` : ''}</li>`).join('')}</ul></div>`;

    const on = (sel, fn) => { const el = $(sel, box); if (el) el.onclick = fn; };
    on('#sAck', act('ack'));
    on('#sCalled', act('action', { type: 'called_user' }));
    on('#s115done', () => act('action', { type: 'reported_115', ref: $('#s115ref', box).value.trim() })());
    on('#sDispatch', () => { if (confirm('Tạo đơn cứu hộ ưu tiên SOS tại vị trí này?')) act('dispatch', { issue: $('#sIssue', box).value })(); });
    on('#sAddNote', () => { const n = $('#sNote', box).value.trim(); if (!n) return toast('Nhập ghi chú', true); act('action', { type: 'note', note: n })(); });
    on('#sResolve', () => {
      const r = $('#sNote', box).value.trim();
      if (r.length < 3) return toast('Ghi kết quả xử lý vào ô ghi chú trước khi đóng', true);
      if (confirm('Đóng tín hiệu SOS này?')) act('resolve', { resolution: r })();
    });
    box.querySelectorAll('[data-notify]').forEach(b => b.onclick = act('action', { type: 'notified_contact', contactId: b.dataset.notify, channel: b.dataset.ch }));
    box.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const t = $(b.dataset.copy, box); navigator.clipboard?.writeText(t.value).then(() => toast('Đã sao chép'), () => { t.select(); }); });
    box.querySelectorAll('[data-order]').forEach(a => a.onclick = (e) => { e.preventDefault(); openOrder(a.dataset.order); });
  });
  $('#sosAll').onchange = (e) => { showAll = e.target.checked; loadList(); };
  const l = (what) => { if (what === 'sos') { loadList(); if (selected) loadDetail(); } };
  listeners.add(l);
  loadList(); if (selected) loadDetail();
  const t = setInterval(() => { loadList(); if (selected) loadDetail(); }, 15_000);
  return () => { clearInterval(t); listeners.delete(l); };
}

boot();
