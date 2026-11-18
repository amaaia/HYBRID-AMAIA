// Piezas comunes de interfaz: acciones por delegación, hoja inferior y componentes pequeños.
import { $, esc, n1, relDay, fmtDate } from './util.js';
import { KIND } from './engine.js';
import { logOf } from './store.js';

/* acciones: cualquier elemento con data-a="nombre" llama a A.nombre(el, evento) */
export const A = {};
export const on = (name, fn) => { A[name] = fn; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const f = A[el.dataset.a];
  if (f) { e.preventDefault(); f(el, e); }
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && A['in:' + el.dataset.in]) A['in:' + el.dataset.in](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && A['ch:' + el.dataset.ch]) A['ch:' + el.dataset.ch](el, e); });

/* render principal (lo asigna main.js) */
let renderFn = () => { };
export const setRender = f => { renderFn = f; };
export const render = () => renderFn();

/* hoja inferior / pantalla completa */
let sheetRedraw = null, sheetOnClose = null;
export function openSheet(draw, { full = false, onClose = null } = {}) {
  let el = $('#sheet');
  if (!el) { el = document.createElement('div'); el.id = 'sheet'; document.body.appendChild(el); }
  sheetRedraw = draw; sheetOnClose = onClose;
  el.innerHTML = `<div class="bg" data-a="closeSheet"></div><div class="box ${full ? 'full' : ''}" role="dialog" aria-modal="true">${full ? '' : '<div class="grab"></div>'}<div id="sheetBody"></div></div>`;
  el.classList.add('on'); document.body.style.overflow = 'hidden';
  redrawSheet();
}
export function redrawSheet() {
  const b = $('#sheetBody'); if (!b || !sheetRedraw) return;
  const box = b.parentElement, st = box.scrollTop;
  b.innerHTML = sheetRedraw(); box.scrollTop = st;
}
export function closeSheet() {
  const el = $('#sheet'); if (!el) return;
  el.classList.remove('on'); el.innerHTML = ''; document.body.style.overflow = '';
  const f = sheetOnClose; sheetRedraw = null; sheetOnClose = null; if (f) f();
  render();
}
export const sheetOpen = () => !!$('#sheet.on');
on('closeSheet', closeSheet);
addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });

export const sheetTop = (title, right = '') => `<div class="sheet-top"><button class="btn ghost sm" data-a="closeSheet">‹ Volver</button><b class="grow" style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</b>${right || '<span style="width:76px"></span>'}</div>`;

/* componentes */
export const kindIcon = s => (KIND[s.kind] || KIND.run).icon;
export function sessionRow(s, opts = {}) {
  const l = logOf(s), st = l?.status === 'done' ? 'done' : l?.status === 'skipped' ? 'skip' : '';
  const meta = [opts.date === false ? '' : relDay(s.date), s.time, `${s.duration} min`, s.distance && s.kind !== 'strength' ? `${n1(s.distance)} km` : ''].filter(Boolean).join(' · ');
  const tag = l?.status === 'done' ? '<span class="tag ok">Hecha</span>' : l?.status === 'skipped' ? '<span class="tag warn">No hecha</span>' : s.dismissed ? '<span class="tag">Descartada</span>' : s.optional ? '<span class="tag">Opcional</span>' : '';
  return `<button class="row" data-a="openSession" data-id="${s.id}"><span class="ki ${st || s.kind}">${st === 'done' ? '✓' : st === 'skip' ? '✕' : kindIcon(s)}</span><span class="grow"><b>${esc(s.title)}</b><span class="mut sm">${esc(meta)}</span></span>${tag}<span class="chev">›</span></button>`;
}
export const empty = (e, t, sub = '', btn = '') => `<div class="empty"><div class="e">${e}</div><h3 style="margin:8px 0 4px">${esc(t)}</h3>${sub ? `<p class="mut">${sub}</p>` : ''}${btn}</div>`;
export const dateLabel = s => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' });

export function confirmDlg(text) { return Promise.resolve(window.confirm(text)); }
