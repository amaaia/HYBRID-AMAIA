// Ficha de sesión, registro, edición, historial de versiones.
import { S, byId, logOf, setLog, clearLog, updateSession, removeSession, setDismissed, restoreVersion, persist } from './store.js';
import { on, openSheet, redrawSheet, closeSheet, sheetTop, kindIcon, render } from './ui.js';
import { esc, n1, relDay, fmtLong, durTxt, distTxt, today, toast, toSec, hms } from './util.js';
import { KIND, PHASE } from './engine.js';
import { targetTxt, zoneName } from './paces.js';

let SID = null, LOG = null;

export function stepTxt(st, tread = S.settings.treadmill) {
  const amount = st.dur ? durTxt(st.dur) : distTxt(st.dist);
  return { amount, what: st.label || zoneName(st.zone), target: targetTxt(S.profile, st.zone, tread), zone: zoneName(st.zone) };
}
export const runSteps = s => (s.blocks || []).filter(b => b.type === 'run').flatMap(b => Array.from({ length: b.rounds || 1 }, () => b.steps || []).flat());
export const hasRun = s => runSteps(s).length > 0;
export const hasEx = s => (s.blocks || []).some(b => b.type === 'exercises' && (b.items || []).length);

export function blocksHtml(s, tread = S.settings.treadmill) {
  return (s.blocks || []).map(b => {
    const head = `<h4>${esc(b.title || '')}${b.rounds > 1 ? ` <span class="tag acc">${b.rounds} ×</span>` : ''}</h4>`;
    if (b.type === 'run') return `<div class="blk run">${head}${(b.steps || []).map(st => { const t = stepTxt(st, tread); return `<div class="step"><span>${esc(t.amount)} · ${esc(t.what)}</span><span class="tg">${esc(t.target)}</span></div>`; }).join('')}</div>`;
    if (b.type === 'exercises') return `<div class="blk exercises">${head}${(b.items || []).map(it => `<div class="ex"><b>${esc(it.name)}</b><span class="mut sm">${it.sets > 1 ? it.sets + ' × ' : ''}${esc(it.reps)}${it.rest ? ` · descanso ${durTxt(it.rest)}` : ''}${it.load ? ' · ' + esc(it.load) : ''}</span>${it.note ? `<div class="xs mut">${esc(it.note)}</div>` : ''}</div>`).join('')}</div>`;
    return `<div class="blk text">${head}<div class="prose">${esc(b.text || '')}</div></div>`;
  }).join('');
}

function detail() {
  const s = byId(SID); if (!s) return sheetTop('Sesión') + '<p>Esta sesión ya no existe.</p>';
  const l = logOf(s), past = s.date < today(), run = hasRun(s), ex = hasEx(s);
  const status = l?.status === 'done' ? `<div class="card flat" style="border-color:var(--ok)"><b>✓ Hecha</b><span class="mut sm"> · ${[l.duration && l.duration + ' min', l.distance && n1(l.distance) + ' km', l.rpe && 'RPE ' + l.rpe, l.pain ? 'molestia ' + ['', 'leve', 'moderada', 'fuerte'][l.pain] : ''].filter(Boolean).join(' · ')}</span>${l.notes ? `<p class="sm" style="margin:6px 0 0">${esc(l.notes)}</p>` : ''}<div class="k" style="margin-top:10px"><button class="btn ghost sm" data-a="logOpen">Editar registro</button><button class="btn ghost sm" data-a="logClear">Borrar registro</button></div></div>`
    : l?.status === 'skipped' ? `<div class="card flat" style="border-color:var(--warn)"><b>Marcada como no hecha</b><div class="k" style="margin-top:10px"><button class="btn ghost sm" data-a="logOpen">Sí la hice</button><button class="btn ghost sm" data-a="logClear">Quitar marca</button></div></div>`
      : s.dismissed ? `<div class="card flat"><b>Descartada</b><p class="mut sm" style="margin:4px 0 8px">No cuenta como saltada ni en tu cumplimiento.</p><button class="btn ghost sm" data-a="sDismiss" data-v="0">↩︎ Recuperar</button></div>` : '';
  const main = !l ? `<div class="hero-actions">
      ${run ? `<button class="btn" data-a="guideStart" data-id="${s.id}">▶ Guía con voz</button>` : ''}
      ${ex ? `<button class="btn" data-a="gymStart" data-id="${s.id}">🏋️ Modo gimnasio</button>` : ''}
      <button class="btn ${run || ex ? 'ghost' : ''}" data-a="logOpen">✓ Ya la hice</button>
      ${past ? `<button class="btn ghost" data-a="sDismiss" data-v="1">Descartar</button>` : ''}
    </div>` : '';
  const hist = (s.hist || []).length;
  return sheetTop(relDay(s.date)) + `
    <div class="row" style="padding-top:0"><span class="ki ${s.kind}">${kindIcon(s)}</span><span class="grow"><span class="mut sm">${(KIND[s.kind] || KIND.run).name}${s.phase ? ' · ' + PHASE[s.phase] : ''}${s.week ? ' · semana ' + s.week : ''}</span></span>${s.source === 'ai' ? '<span class="tag acc">Coach IA</span>' : ''}</div>
    <h2 style="margin:4px 0 6px">${esc(s.title)}</h2>
    <p class="mut" style="margin:0 0 12px">${fmtLong(s.date)}${s.time ? ' · ' + s.time : ''} · ${s.duration} min${s.distance && s.kind !== 'strength' ? ' · ' + n1(s.distance) + ' km' : ''}${s.focus ? ' · ' + esc(s.focus) : ''}</p>
    ${status}${main}
    <div class="card">
      ${run ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px"><h3>Plan</h3><div class="seg"><button class="${S.settings.treadmill ? '' : 'on'}" data-a="tread" data-v="0">min/km</button><button class="${S.settings.treadmill ? 'on' : ''}" data-a="tread" data-v="1">Cinta km/h</button></div></div>` : '<h3>Plan</h3>'}
      ${blocksHtml(s)}
      ${s.notes ? `<p class="sm" style="margin:12px 0 0">💡 ${esc(s.notes)}</p>` : ''}
    </div>
    <div class="card">
      <button class="row" data-a="sMove"><span class="ki">📅</span><span class="grow"><b>Cambiar de día u hora</b></span><span class="chev">›</span></button>
      <button class="row" data-a="sEdit"><span class="ki">✏️</span><span class="grow"><b>Editar</b><span class="mut sm">Título, duración, notas</span></span><span class="chev">›</span></button>
      <button class="row" data-a="askCoach" data-id="${s.id}"><span class="ki">💬</span><span class="grow"><b>Preguntar al coach</b><span class="mut sm">Pedir una versión más corta, en cinta, sin material…</span></span><span class="chev">›</span></button>
      <button class="row" data-a="sHist"><span class="ki">🕘</span><span class="grow"><b>Historial de cambios</b><span class="mut sm">${hist ? hist + ' versión' + (hist > 1 ? 'es' : '') + ' anterior' + (hist > 1 ? 'es' : '') : 'Sin cambios todavía'}</span></span><span class="chev">›</span></button>
      ${!l && !past ? `<button class="row" data-a="logSkip"><span class="ki">✕</span><span class="grow"><b>No la voy a hacer</b></span><span class="chev">›</span></button>` : ''}
      <button class="row" data-a="sDelete"><span class="ki">🗑️</span><span class="grow"><b style="color:var(--bad)">Eliminar del plan</b></span></button>
    </div>`;
}

export function openSession(id) { SID = id; openSheet(detail, { full: true }); }
on('openSession', el => openSession(el.dataset.id));
on('tread', el => { S.settings.treadmill = el.dataset.v === '1'; persist({ noPush: true }); redrawSheet(); });
on('sDismiss', el => { setDismissed(SID, el.dataset.v === '1'); toast(el.dataset.v === '1' ? 'Descartada: no cuenta como saltada' : 'Recuperada'); redrawSheet(); });
on('sDelete', () => { if (!confirm('¿Eliminar esta sesión del plan? Podrás recuperarla desde Ajustes › Papelera.')) return; removeSession(SID); closeSheet(); toast('Sesión eliminada'); });

/* ---------- registro ---------- */
function logView() {
  const s = byId(SID), d = LOG;
  const run = s.kind === 'run' || s.kind === 'race' || hasRun(s);
  return sheetTop('Registrar') + `<h3>${esc(s.title)}</h3><p class="mut sm">${fmtLong(s.date)}</p>
    <label class="f">¿Cuánto te ha costado? (RPE)</label><div class="rpe">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="chip ${+d.rpe === n ? 'on' : ''}" data-a="logRpe" data-v="${n}">${n}</button>`).join('')}</div>
    <p class="hint">${['', 'Muy fácil', 'Muy fácil', 'Fácil', 'Cómodo', 'Moderado', 'Algo duro', 'Duro', 'Muy duro', 'Casi al máximo', 'Máximo'][+d.rpe || 0] || '1 = paseo · 10 = no podía más'}</p>
    <div class="grid2"><div><label class="f">Duración (min)</label><input class="in" type="number" inputmode="numeric" value="${esc(d.duration ?? '')}" data-in="log" data-k="duration"></div>
    ${run ? `<div><label class="f">Distancia (km)</label><input class="in" type="number" inputmode="decimal" step="0.01" value="${esc(d.distance ?? '')}" data-in="log" data-k="distance"></div>` : '<div></div>'}</div>
    ${s.kind === 'race' || s.kind === 'hybrid' ? `<label class="f">Tiempo total (opcional)</label><input class="in" inputmode="numeric" placeholder="Ej.: 1:32:10" value="${esc(d.time ?? '')}" data-in="log" data-k="time">` : ''}
    <label class="f">Molestias</label><div class="chips">${['Ninguna', 'Leve', 'Moderada', 'Fuerte'].map((t, i) => `<button class="chip ${+d.pain === i ? 'on' : ''}" data-a="logPain" data-v="${i}">${t}</button>`).join('')}</div>
    ${+d.pain >= 2 ? '<p class="hint" style="color:var(--warn)">Si el dolor es agudo, empeora o cambia tu forma de moverte, para y consulta con un profesional. El coach reducirá la carga.</p>' : ''}
    <label class="f">Notas (opcional)</label><textarea class="in" placeholder="Sensaciones, sueño, técnica…" data-in="log" data-k="notes">${esc(d.notes ?? '')}</textarea>
    <div class="sp"></div><button class="btn" data-a="logSave">Guardar</button>`;
}
export function openLog(id, prefill = {}) {
  SID = id; const s = byId(id), l = logOf(s);
  LOG = { rpe: l?.rpe ?? '', duration: l?.duration ?? s.duration, distance: l?.distance ?? (s.distance || ''), pain: l?.pain ?? 0, notes: l?.notes ?? '', time: l?.time ?? '', ...prefill };
  openSheet(logView, { onClose: () => { } });
}
on('logOpen', () => openLog(SID));
on('logRpe', el => { LOG.rpe = +el.dataset.v; redrawSheet(); });
on('logPain', el => { LOG.pain = +el.dataset.v; redrawSheet(); });
on('in:log', el => { LOG[el.dataset.k] = el.value; });
on('logSave', () => {
  if (!LOG.rpe) { toast('Elige el esfuerzo (RPE)'); return; }
  const s = byId(SID), time = toSec(LOG.time);
  setLog(SID, { status: 'done', rpe: +LOG.rpe, duration: +LOG.duration || null, distance: +String(LOG.distance).replace(',', '.') || null, pain: +LOG.pain || 0, notes: LOG.notes.trim(), time: time ? hms(time) : '', date: s.date <= today() ? s.date : today(), sets: LOG.sets || logOf(s)?.sets });
  if (s.kind === 'race' && +s.distance === 5 && time) suggest5k(time);
  closeSheet(); toast('¡Guardado! 💪');
});
on('logSkip', () => { if (!confirm('¿Marcar como no hecha?')) return; setLog(SID, { status: 'skipped' }); redrawSheet(); toast('Marcada como no hecha'); });
on('logClear', () => { clearLog(SID); redrawSheet(); });
function suggest5k(sec) {
  const cur = toSec(S.profile.fiveK);
  if (!cur || sec < cur) { if (confirm(`¿Usar ${hms(sec)} como tu 5K de referencia? Todos los ritmos del plan se recalculan.`)) { S.profile.fiveK = hms(sec); persist(); } }
}

/* ---------- mover y editar ---------- */
let ED = null;
function editView() {
  const e = ED;
  return sheetTop(e.mode === 'move' ? 'Cambiar de día' : 'Editar') + (e.mode === 'move'
    ? `<label class="f">Día</label><input class="in" type="date" value="${e.date}" data-in="ed" data-k="date"><label class="f">Hora (opcional)</label><input class="in" type="time" value="${esc(e.time || '')}" data-in="ed" data-k="time">
       <p class="hint">Consejo: evita poner dos sesiones duras en días seguidos.</p>`
    : `<label class="f">Título</label><input class="in" value="${esc(e.title)}" data-in="ed" data-k="title">
       <div class="grid2"><div><label class="f">Duración (min)</label><input class="in" type="number" value="${e.duration}" data-in="ed" data-k="duration"></div><div><label class="f">Km (opcional)</label><input class="in" type="number" step="0.1" value="${e.distance ?? ''}" data-in="ed" data-k="distance"></div></div>
       <label class="f">Notas</label><textarea class="in" data-in="ed" data-k="notes">${esc(e.notes || '')}</textarea>
       <label class="switch"><span><b>Opcional</b></span><input type="checkbox" ${e.optional ? 'checked' : ''} data-ch="edOpt"></label>`) +
    `<div class="sp"></div><button class="btn" data-a="edSave">Guardar cambios</button>`;
}
on('sMove', () => { const s = byId(SID); ED = { mode: 'move', date: s.date, time: s.time }; openSheet(editView); });
on('sEdit', () => { const s = byId(SID); ED = { mode: 'edit', title: s.title, duration: s.duration, distance: s.distance, notes: s.notes, optional: s.optional }; openSheet(editView); });
on('in:ed', el => { ED[el.dataset.k] = el.value; });
on('ch:edOpt', el => { ED.optional = el.checked; });
on('edSave', () => {
  const p = ED.mode === 'move' ? { date: ED.date, time: ED.time || '' } : { title: ED.title.trim() || 'Sesión', duration: +ED.duration || 30, distance: +ED.distance || null, notes: ED.notes || '', optional: !!ED.optional };
  if (ED.mode === 'move' && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) { toast('Elige una fecha'); return; }
  updateSession(SID, p, ED.mode === 'move' ? 'Movida de día' : 'Editada a mano');
  toast('Cambios guardados'); openSession(SID);
});

/* ---------- historial ---------- */
function histView() {
  const s = byId(SID), H = [...(s.hist || [])].map((h, i) => ({ ...h, i })).reverse();
  return sheetTop('Historial') + (H.length ? `<p class="mut sm">Cada vez que cambia esta sesión se guarda cómo estaba antes. Puedes verla y restaurarla; la versión actual no se pierde.</p>` + H.map(h => `<div class="hist">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(h.v.title)}</b><span class="mut xs">${new Date(h.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <span class="mut sm">${esc(h.by)} · antes: ${relDay(h.v.date)} · ${h.v.duration} min</span>
      <div class="k" style="margin-top:8px"><button class="btn ghost sm" data-a="hView" data-i="${h.i}">${ED?.hv === h.i ? 'Ocultar' : 'Ver'}</button>${logOf(s) ? '' : `<button class="btn ghost sm" data-a="hRestore" data-i="${h.i}">↩︎ Restaurar</button>`}</div>
      ${ED?.hv === h.i ? `<div class="card flat" style="margin-top:8px">${blocksHtml(h.v)}${h.v.notes ? `<p class="sm">💡 ${esc(h.v.notes)}</p>` : ''}</div>` : ''}</div>`).join('')
    : '<p class="mut">Esta sesión no ha cambiado desde que se creó.</p>');
}
on('sHist', () => { ED = { hv: -1 }; openSheet(histView); });
on('hView', el => { ED.hv = ED.hv === +el.dataset.i ? -1 : +el.dataset.i; redrawSheet(); });
on('hRestore', el => { if (!confirm('¿Restaurar esta versión?')) return; restoreVersion(SID, +el.dataset.i); toast('Versión restaurada'); openSession(SID); });

export const currentSid = () => SID;
