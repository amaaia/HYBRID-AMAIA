// Utilidades sin dependencias: fechas en hora local, formato y escape de HTML.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dt = s => new Date(s + 'T12:00:00');
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((dt(a) - dt(b)) / 864e5);
export const monday = s => { const d = dt(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
export const weekday = s => (dt(s).getDay() + 6) % 7; // 0 = lunes

const LOC = 'es-ES';
export const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => dt(s).toLocaleDateString(LOC, o);
export const fmtLong = s => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const relDay = s => {
  const n = diffDays(s, today());
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n > 1 && n < 7) return fmtDate(s, { weekday: 'long' });
  return fmtDate(s);
};
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAYS_S = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const n1 = x => (Math.round(x * 10) / 10).toLocaleString(LOC);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sum = a => a.reduce((x, y) => x + y, 0);
export const avg = a => (a.length ? sum(a) / a.length : null);
export const clone = o => JSON.parse(JSON.stringify(o));

// tiempos: "25:30" o "1:52:10" <-> segundos
export const toSec = t => {
  if (t == null || t === '') return null;
  const p = String(t).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
};
export const hms = s => {
  if (s == null || !isFinite(s)) return '—';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
};
export const durTxt = sec => {
  if (sec >= 3600) return `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
  if (sec >= 60) return sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec / 60} min`;
  return `${sec} s`;
};
export const distTxt = km => (km >= 1 ? `${n1(km)} km` : `${Math.round(km * 1000)} m`);

export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
}

export const safe = (f, d = null) => { try { return f(); } catch (e) { return d; } };
export const ls = {
  get: (k, d) => safe(() => { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }, d),
  set: (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v))),
  del: k => safe(() => localStorage.removeItem(k)),
};
