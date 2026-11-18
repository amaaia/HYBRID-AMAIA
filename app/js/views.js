// Pantallas principales: Hoy, Plan, Progreso, Coach y Ajustes.
import { S, persist, sorted, logOf, isDone, nextSession, missed, raceSession, setLog, setDismissed, addSession, regenerateLocal, exportData, importData, undoRemove, resetAll, upcoming } from './store.js';
import { on, openSheet, redrawSheet, closeSheet, sheetTop, sessionRow, empty, kindIcon, render } from './ui.js';
import { esc, n1, today, addDays, monday, diffDays, fmtDate, fmtLong, relDay, DAYS, DAYS_S, hms, toSec, avg, sum, toast, iso, weekday } from './util.js';
import { GOALS, RACE_KM, KIND, PHASE, planWeeks, phaseOf } from './engine.js';
import { ZONES, targetTxt, predict, base5k } from './paces.js';
import { hasRun, hasEx, openSession, openLog } from './session.js';
import { startGuide, startGym } from './guide.js';
import * as cloud from './cloud.js';
import { sendChat, applyChange, discardChange, generateBlockAI, needsNextBlock, nextBlockRange } from './ai.js';
import { CONFIG } from './config.js';
import { resetOnboarding } from './onboarding.js';

export const VERSION = '1.0.0';
export const UI = { tab: 'today', planMode: 'week', calMonth: today().slice(0, 7), calDay: today(), busy: '' };

/* ---------- Hoy ---------- */
function goalCard() {
  const P = S.profile, g = GOALS[P.goal] || GOALS.hybrid, race = raceSession();
  const { start, end, weeks } = planWeeks(P), w = Math.min(weeks, Math.max(1, Math.floor(diffDays(today(), start) / 7) + 1));
  const ph = phaseOf(w - 1, weeks, P.goal !== 'hybrid' && !!P.raceDate);
  const days = race ? diffDays(race.date, today()) : diffDays(end, today());
  const pct = Math.round(Math.min(1, Math.max(0, diffDays(today(), start) / Math.max(1, diffDays(end, start)))) * 100);
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
    <div><span class="mut sm">${g.icon} ${esc(g.short)}</span><h3 style="margin-top:2px">${esc(race ? race.title : 'Ciclo de 12 semanas')}</h3><span class="mut sm">Semana ${w} de ${weeks} · fase ${PHASE[ph]}${(w % 4 === 0 && ph !== 'taper') ? ' · descarga' : ''}</span></div>
    <div style="text-align:right"><b style="font-size:28px" class="num">${Math.max(0, days)}</b><div class="mut xs">días${race ? ' para la carrera' : ' para acabar'}</div></div></div>
    <div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div></div>`;
}
function heroCard() {
  const n = nextSession();
  if (!n) return `<div class="card hero">${empty('🎉', 'Plan completado', '¡Enhorabuena! Crea un nuevo ciclo desde Ajustes.', '<button class="btn" data-a="settings">Ir a Ajustes</button>')}</div>`;
  const run = hasRun(n), ex = hasEx(n);
  const startBtn = run ? `<button class="btn" data-a="guideStart" data-id="${n.id}">▶ Empezar con guía</button>` : ex ? `<button class="btn" data-a="gymStart" data-id="${n.id}">🏋️ Empezar</button>` : `<button class="btn" data-a="openSession" data-id="${n.id}">Ver sesión</button>`;
  return `<div class="card hero"><span class="pill">${kindIcon(n)} ${(KIND[n.kind] || KIND.run).name}</span> <span class="pill">${relDay(n.date)}${n.time ? ' · ' + n.time : ''}</span>
    <h2>${esc(n.title)}</h2><p class="mut" style="margin:0">${n.duration} min${n.distance && n.kind !== 'strength' ? ' · ' + n1(n.distance) + ' km' : ''}${n.focus ? ' · ' + esc(n.focus) : ''}</p>
    <div class="hero-actions" style="margin-top:16px">${startBtn}<button class="btn ghost" data-a="quickDone" data-id="${n.id}">✓ Ya la hice</button>${run || ex ? `<button class="btn ghost" data-a="openSession" data-id="${n.id}">Ver detalle</button>` : ''}</div></div>`;
}
function weekStrip() {
  const ws = monday(today()), days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const W = sorted().filter(s => s.date >= ws && s.date <= days[6] && !s.dismissed);
  const core = W.filter(s => !s.optional), done = core.filter(isDone);
  const min = sum(W.filter(isDone).map(s => +logOf(s).duration || s.duration)), km = sum(W.filter(isDone).map(s => +logOf(s).distance || 0));
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>Esta semana</h3><button class="link" data-a="tab" data-v="plan">Ver plan ›</button></div>
    <div class="week" style="margin-top:12px">${days.map(d => { const ss = W.filter(s => s.date === d); return `<button class="d ${d === today() ? 'today' : ''}" ${ss[0] ? `data-a="openSession" data-id="${ss[0].id}"` : ''}><span>${DAYS_S[weekday(d)]}</span><b>${+d.slice(8)}</b><span style="display:flex;gap:3px">${ss.map(s => `<i class="dot ${isDone(s) ? 'done' : logOf(s)?.status === 'skipped' ? 'skip' : s.kind}"></i>`).join('')}</span></button>`; }).join('')}</div>
    <div class="stats" style="margin-top:12px"><div class="stat"><b>${done.length}/${core.length}</b><span>sesiones</span></div><div class="stat"><b>${min}</b><span>minutos</span></div><div class="stat"><b>${n1(km)}</b><span>km</span></div></div></div>`;
}
function missedCard() {
  const m = missed(10); if (!m.length) return '';
  return `<div class="card" style="border-color:var(--warn)"><h3>${m.length === 1 ? 'Una sesión' : m.length + ' sesiones'} sin registrar</h3><p class="mut sm" style="margin:4px 0 6px">Márcalas para que el plan y el coach sepan cómo vas.</p>
    ${m.slice(0, 4).map(s => `<div class="row"><span class="ki ${s.kind}">${kindIcon(s)}</span><span class="grow"><b>${esc(s.title)}</b><span class="mut sm">${relDay(s.date)}</span></span></div>
      <div class="k" style="margin:-2px 0 8px 52px"><button class="btn sm" data-a="quickDone" data-id="${s.id}">Hecha</button><button class="btn ghost sm" data-a="mSkip" data-id="${s.id}">No la hice</button><button class="btn ghost sm" data-a="mDismiss" data-id="${s.id}">Descartar</button></div>`).join('')}
    ${m.length > 1 ? `<button class="btn ghost sm" data-a="mDismissAll">Descartar todas</button>` : ''}</div>`;
}
function coachCard() {
  if (!cloud.enabled()) return '';
  if (UI.busy) return `<div class="card"><span class="spin"></span> ${esc(UI.busy)}</div>`;
  const hasAi = S.sessions.some(s => s.source === 'ai');
  if (needsNextBlock()) { const r = nextBlockRange(); return `<div class="card" style="border-color:var(--acc)"><h3>💬 Tu próximo bloque</h3><p class="mut sm" style="margin:4px 0 10px">El coach puede diseñar las semanas del ${fmtDate(r.from)} al ${fmtDate(r.to)} teniendo en cuenta cómo te ha ido.</p><button class="btn" data-a="aiBlock">Diseñar próximo bloque</button></div>`; }
  if (!hasAi && S.sessions.length) return `<div class="card"><h3>💬 Personaliza tu plan</h3><p class="mut sm" style="margin:4px 0 10px">Ahora tienes el plan automático. El coach IA puede diseñar tus próximas 6 semanas a tu medida.</p><button class="btn ghost" data-a="aiBlock">Diseñar con el coach</button></div>`;
  if (S.lastBlock?.summary && diffDays(today(), iso(new Date(S.lastBlock.at))) < 3) return `<div class="card"><h3>💬 Idea del bloque</h3><p class="sm" style="margin:6px 0 0">${esc(S.lastBlock.summary)}</p></div>`;
  return '';
}
function reviewCard() {
  const wd = weekday(today());
  if (wd !== 6 && wd !== 0) return '';
  if (!cloud.enabled()) return '';
  return `<div class="card"><h3>📝 Revisión semanal</h3><p class="mut sm" style="margin:4px 0 10px">Pide al coach que analice tu semana y ajuste la siguiente.</p><button class="btn ghost" data-a="askReview">Revisar mi semana</button></div>`;
}
export function todayView() {
  const P = S.profile, h = new Date().getHours();
  const hi = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return `<div class="top"><div class="t"><h1>${hi}${P.name ? ', ' + esc(P.name) : ''}</h1><span class="mut">${fmtLong(today())}</span></div><button class="iconbtn" data-a="settings" aria-label="Ajustes">⚙️</button></div>
    ${heroCard()}${missedCard()}${coachCard()}${weekStrip()}${goalCard()}${reviewCard()}`;
}
on('quickDone', el => openLog(el.dataset.id));
on('mSkip', el => { setLog(el.dataset.id, { status: 'skipped' }); toast('Marcada como no hecha'); });
on('mDismiss', el => { setDismissed(el.dataset.id, true); toast('Descartada'); });
on('mDismissAll', () => { missed(10).forEach(s => (s.dismissed = true)); persist(); toast('Descartadas'); });
export async function runAiBlock() {
  if (!cloud.currentUser()) { openAccount(); return; }
  if (UI.busy) return;
  UI.busy = 'Preparando…'; render();
  try { const r = await generateBlockAI(t => { UI.busy = t; render(); }); toast(`Plan actualizado: ${r.n} sesiones nuevas`); }
  catch (e) { toast(e.message, 5000); }
  UI.busy = ''; render();
}
on('aiBlock', runAiBlock);
on('askReview', () => { UI.tab = 'coach'; render(); ask('Revisa mi semana: qué tal ha ido según mis registros y si hay que ajustar algo de la próxima.'); });

/* ---------- Plan ---------- */
function weekList() {
  const all = sorted(), P = S.profile, { start, weeks } = planWeeks(P), hasRace = P.goal !== 'hybrid' && !!P.raceDate;
  if (!all.length) return empty('🗓️', 'Sin sesiones', 'Crea un plan desde Ajustes.');
  const first = monday(all[0].date), last = monday(all.at(-1).date), out = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    const ss = all.filter(s => s.date >= w && s.date <= addDays(w, 6)); if (!ss.length) continue;
    const idx = Math.floor(diffDays(w, start) / 7), ph = idx >= 0 && idx < weeks ? phaseOf(idx, weeks, hasRace) : null;
    const cur = w === monday(today());
    out.push(`<div class="wkhead" ${cur ? 'id="curweek"' : ''}><b>${cur ? 'Esta semana' : 'Semana del ' + fmtDate(w, { day: 'numeric', month: 'short' })}</b><span class="mut sm">${ph ? PHASE[ph] + (((idx + 1) % 4 === 0 && ph !== 'taper') ? ' · descarga' : '') : ''} · ${sum(ss.filter(s => !s.optional).map(s => s.duration))} min</span></div>
      <div class="card" style="padding:4px 16px">${ss.map(s => sessionRow(s)).join('')}</div>`);
  }
  return out.join('');
}
function monthCal() {
  const [y, m] = UI.calMonth.split('-').map(Number), first = `${UI.calMonth}-01`, start = monday(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i)), all = sorted();
  const day = all.filter(s => s.date === UI.calDay);
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><button class="btn ghost sm" data-a="calM" data-v="-1" aria-label="mes anterior">‹</button><b>${new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</b><button class="btn ghost sm" data-a="calM" data-v="1" aria-label="mes siguiente">›</button></div>
    <div class="cal">${DAYS_S.map(d => `<div class="h">${d}</div>`).join('')}${cells.map(d => { const ss = all.filter(s => s.date === d && !s.dismissed); return `<button class="c ${d.slice(0, 7) !== UI.calMonth ? 'out' : ''} ${d === today() ? 'today' : ''} ${d === UI.calDay ? 'sel' : ''}" data-a="calD" data-v="${d}"><span>${+d.slice(8)}</span><span class="dots">${ss.map(s => `<i class="dot ${isDone(s) ? 'done' : logOf(s)?.status === 'skipped' ? 'skip' : s.kind}"></i>`).join('')}</span></button>`; }).join('')}</div></div>
    <h3 style="margin:16px 4px 8px">${fmtLong(UI.calDay)}</h3><div class="card" style="padding:4px 16px">${day.length ? day.map(s => sessionRow(s, { date: false })).join('') : '<p class="mut">Descanso</p>'}</div>`;
}
export function planView() {
  return `<div class="top"><h1>Plan</h1><div class="k"><button class="iconbtn" data-a="addSession" aria-label="Añadir sesión">＋</button><button class="iconbtn" data-a="settings" aria-label="Ajustes">⚙️</button></div></div>
    <div class="seg" style="margin-bottom:6px"><button class="${UI.planMode === 'week' ? 'on' : ''}" data-a="planMode" data-v="week">Semanas</button><button class="${UI.planMode === 'month' ? 'on' : ''}" data-a="planMode" data-v="month">Calendario</button></div>
    ${UI.planMode === 'week' ? weekList() : monthCal()}`;
}
on('planMode', el => { UI.planMode = el.dataset.v; render(); if (UI.planMode === 'week') setTimeout(() => document.getElementById('curweek')?.scrollIntoView({ block: 'start' }), 0); });
on('calM', el => { const [y, m] = UI.calMonth.split('-').map(Number), d = new Date(y, m - 1 + +el.dataset.v, 1); UI.calMonth = iso(d).slice(0, 7); render(); });
on('calD', el => { UI.calDay = el.dataset.v; render(); });

let NEW = null;
function addView() {
  return sheetTop('Nueva sesión') + `<label class="f">Tipo</label><div class="chips">${Object.entries(KIND).map(([k, v]) => `<button class="chip ${NEW.kind === k ? 'on' : ''}" data-a="newKind" data-v="${k}">${v.icon} ${v.name}</button>`).join('')}</div>
    <label class="f">Título</label><input class="in" value="${esc(NEW.title)}" data-in="new" data-k="title" placeholder="Ej.: Rodaje con amigos">
    <div class="grid2"><div><label class="f">Fecha</label><input class="in" type="date" value="${NEW.date}" data-in="new" data-k="date"></div><div><label class="f">Duración (min)</label><input class="in" type="number" value="${NEW.duration}" data-in="new" data-k="duration"></div></div>
    <label class="f">Descripción</label><textarea class="in" data-in="new" data-k="text" placeholder="Qué vas a hacer">${esc(NEW.text)}</textarea>
    <div class="sp"></div><button class="btn" data-a="newSave">Añadir al plan</button>`;
}
on('addSession', () => { NEW = { kind: 'run', title: '', date: UI.planMode === 'month' ? UI.calDay : today(), duration: 45, text: '' }; openSheet(addView); });
on('newKind', el => { NEW.kind = el.dataset.v; redrawSheet(); });
on('in:new', el => { NEW[el.dataset.k] = el.value; });
on('newSave', () => {
  const s = addSession({ kind: NEW.kind, title: NEW.title.trim() || KIND[NEW.kind].name, date: NEW.date || today(), duration: +NEW.duration || 30, intensity: 'moderate', blocks: NEW.text.trim() ? [{ title: 'Sesión', type: 'text', text: NEW.text.trim() }] : [] }, 'Añadida a mano');
  closeSheet(); toast('Sesión añadida'); openSession(s.id);
});

/* ---------- Progreso ---------- */
export function progressView() {
  const all = sorted(), done = all.filter(isDone);
  const from28 = iso(new Date(Date.now() - 28 * 864e5));
  const past = all.filter(s => s.date >= from28 && s.date < today() && !s.optional && !s.dismissed);
  const adh = past.length ? Math.round(past.filter(isDone).length / past.length * 100) : null;
  const ws = monday(today()), weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, (i - 7) * 7));
  const wk = weeks.map(w => { const d = done.filter(s => (logOf(s).date || s.date) >= w && (logOf(s).date || s.date) <= addDays(w, 6)); return { w, km: sum(d.map(s => +logOf(s).distance || 0)), min: sum(d.map(s => +logOf(s).duration || 0)), str: d.filter(s => ['strength', 'hybrid', 'conditioning'].includes(s.kind)).length, load: sum(d.map(s => (+logOf(s).duration || s.duration) * (+logOf(s).rpe || 5))) }; });
  const maxKm = Math.max(5, ...wk.map(x => x.km)), maxMin = Math.max(60, ...wk.map(x => x.min));
  const rpe = avg(done.filter(s => (logOf(s).date || s.date) >= from28).map(s => +logOf(s).rpe).filter(Boolean));
  const last = wk.at(-1).load, prev = avg(wk.slice(-5, -1).map(x => x.load).filter(Boolean));
  const jump = prev && last > prev * 1.3;
  const pains = done.filter(s => (logOf(s).date || s.date) >= from28 && +logOf(s).pain >= 2);
  // fuerza: mejor carga por ejercicio
  const best = {};
  done.forEach(s => Object.entries(logOf(s).sets || {}).forEach(([k, a]) => a.filter(x => x.done && x.kg).forEach(x => { if (!best[k] || +x.kg > best[k].kg) best[k] = { kg: +x.kg, reps: x.reps, date: s.date }; })));
  const P = S.profile, b = base5k(P);
  return `<div class="top"><h1>Progreso</h1><button class="iconbtn" data-a="settings" aria-label="Ajustes">⚙️</button></div>
    <div class="stats" style="margin-bottom:12px"><div class="stat"><b>${done.length}</b><span>sesiones hechas</span></div><div class="stat"><b>${adh == null ? '—' : adh + '%'}</b><span>cumplimiento 4 sem.</span></div><div class="stat"><b>${rpe ? n1(rpe) : '—'}</b><span>RPE medio</span></div></div>
    ${jump ? `<div class="card" style="border-color:var(--warn)"><b>⚠️ Carga en aumento</b><p class="sm mut" style="margin:4px 0 0">Esta semana llevas un ${Math.round((last / prev - 1) * 100)} % más de carga que tu media. Prioriza dormir bien y no añadas extra.</p></div>` : ''}
    ${pains.length ? `<div class="card" style="border-color:var(--warn)"><b>🩹 Molestias recientes</b><p class="sm mut" style="margin:4px 0 0">${pains.length} sesión${pains.length > 1 ? 'es' : ''} con molestia moderada o fuerte en 4 semanas. Si persiste, consulta con un profesional y cuéntaselo al coach.</p></div>` : ''}
    <div class="card"><h3>Kilómetros por semana</h3><div class="chart">${wk.map(x => `<div class="col"><i style="height:${x.km / maxKm * 100}%"></i><span>${x.km ? n1(x.km) : ''}</span><span>${fmtDate(x.w, { day: 'numeric', month: 'numeric' })}</span></div>`).join('')}</div></div>
    <div class="card"><h3>Minutos por semana</h3><div class="chart">${wk.map(x => `<div class="col"><i class="str" style="height:${x.min / maxMin * 100}%"></i><span>${x.min || ''}</span><span>${fmtDate(x.w, { day: 'numeric', month: 'numeric' })}</span></div>`).join('')}</div></div>
    <div class="card"><h3>Tus ritmos</h3><p class="mut sm" style="margin:4px 0 8px">Calculados con tu 5K ${P.fiveK ? 'de ' + esc(P.fiveK) : 'estimado (' + hms(b) + ')'}. Cámbialo en Ajustes › Perfil.</p>
      ${['easy', 'steady', 'hybrid', 'tempo', 'threshold', 'interval', 'rep'].map(z => `<div class="step"><span>${ZONES[z].name}<span class="mut xs" style="display:block">${ZONES[z].hint} · RPE ${ZONES[z].rpe}</span></span><span class="tg">${targetTxt(P, z, S.settings.treadmill)}</span></div>`).join('')}
      <div class="seg" style="margin-top:10px"><button class="${S.settings.treadmill ? '' : 'on'}" data-a="tread2" data-v="0">min/km</button><button class="${S.settings.treadmill ? 'on' : ''}" data-a="tread2" data-v="1">Cinta km/h</button></div></div>
    <div class="card"><h3>Previsión de marcas</h3><p class="mut sm" style="margin:4px 0 8px">Según tu 5K, si entrenas la distancia.</p><div class="grid2">${[5, 10, 21.1, 42.2].map(k => `<div class="stat"><b>${hms(predict(b, k))}</b><span>${RACE_KM[k]}</span></div>`).join('')}</div></div>
    <div class="card"><h3>Fuerza</h3>${Object.keys(best).length ? Object.entries(best).sort((a, b) => b[1].kg - a[1].kg).slice(0, 8).map(([k, v]) => `<div class="step"><span>${esc(k)}</span><span class="tg">${n1(v.kg)} kg × ${v.reps || '?'}</span></div>`).join('') : '<p class="mut sm">Usa el modo gimnasio para registrar pesos y ver aquí tus mejores marcas.</p>'}</div>`;
}
on('tread2', el => { S.settings.treadmill = el.dataset.v === '1'; persist({ noPush: true }); });

/* ---------- Coach ---------- */
const SUGG = ['¿Qué tal voy?', 'Hoy estoy cansada/o, ¿qué hago?', 'Esta semana solo puedo 3 días', 'Tengo molestias en la rodilla', 'Hazme la sesión de hoy en cinta', 'Explícame la sesión de mañana'];
function changeHtml(m, c, i) {
  const s = c.session || {}, op = { add: 'Añadir', modify: 'Cambiar', remove: 'Quitar' }[c.op];
  const st = c.status === 'applied' ? '<span class="tag ok">Aplicado</span>' : c.status === 'dismissed' ? '<span class="tag">Descartado</span>' : c.status === 'failed' ? '<span class="tag warn">No se pudo aplicar</span>' : '';
  return `<div class="change"><b>${op}: ${esc(s.title || '')}</b> <span class="mut sm">${s.date ? relDay(s.date) : ''}${s.duration ? ' · ' + s.duration + ' min' : ''}</span>${st}<div class="sm mut">${esc(c.reason || '')}</div>
    ${c.status === 'pending' ? `<div class="k" style="margin-top:8px"><button class="btn sm" data-a="chApply" data-m="${m.id}" data-i="${i}">Aplicar</button><button class="btn ghost sm" data-a="chDiscard" data-m="${m.id}" data-i="${i}">Descartar</button></div>` : ''}</div>`;
}
export function coachView() {
  const head = `<div class="top"><h1>Coach</h1><button class="iconbtn" data-a="settings" aria-label="Ajustes">⚙️</button></div>`;
  if (!cloud.enabled()) return head + `<div class="card">${empty('💬', 'Coach no disponible', 'Esta instalación no tiene configurado el coach IA. El plan automático, la guía y el registro funcionan igual.')}</div>`;
  if (!cloud.currentUser()) return head + `<div class="card">${empty('💬', 'Habla con tu coach', 'Pregunta lo que quieras, cuéntale cómo estás y deja que ajuste tu plan. Necesitas una cuenta gratuita.', '<button class="btn" data-a="account">Entrar con mi email</button>')}</div>`;
  const q = S.quota, left = q ? Math.max(0, q.chatLimit - q.chat) : null;
  return head + `<p class="mut sm" style="margin:-8px 0 12px">${left == null ? '' : `Te quedan ${left} de ${q.chatLimit} mensajes este mes.`} El coach no sustituye a un profesional sanitario.</p>
    <div class="msgs">${S.chat.length ? S.chat.slice(-60).map(m => `<div class="msg ${m.role} ${m.error ? 'err' : ''}">${esc(m.text)}${(m.changes || []).map((c, i) => changeHtml(m, c, i)).join('')}</div>`).join('') : `<div class="card flat">${empty('👋', '¿En qué te ayudo?', 'Conozco tu plan y tus registros. Prueba con una de estas preguntas:')}</div>`}
    ${UI.busy === 'chat' ? '<div class="msg assistant"><span class="spin"></span></div>' : ''}</div><div style="height:150px"></div>
    <div class="composer"><div class="suggest">${SUGG.map(t => `<button data-a="sugg">${esc(t)}</button>`).join('')}</div><form data-a="noop" onsubmit="return false"><textarea id="chatIn" rows="1" placeholder="Escribe al coach…" aria-label="Mensaje"></textarea><button class="btn" style="width:auto" data-a="chatSend" ${UI.busy === 'chat' ? 'disabled' : ''}>Enviar</button></form></div>`;
}
async function ask(text) {
  if (!text.trim() || UI.busy === 'chat') return;
  UI.busy = 'chat'; render(); scrollBottom();
  try { await sendChat(text.trim()); } catch (e) { if (e.code === 'auth') openAccount(); }
  UI.busy = ''; render(); scrollBottom();
}
const scrollBottom = () => setTimeout(() => scrollTo(0, document.body.scrollHeight), 30);
on('chatSend', () => { const t = document.getElementById('chatIn'); const v = t.value; t.value = ''; ask(v); });
on('sugg', el => ask(el.textContent));
on('chApply', el => { const ok = applyChange(el.dataset.m, +el.dataset.i); toast(ok ? 'Cambio aplicado (queda en el historial de la sesión)' : 'No se pudo aplicar: la sesión ya no existe o está registrada'); });
on('chDiscard', el => discardChange(el.dataset.m, +el.dataset.i));
on('askCoach', el => { const s = S.sessions.find(x => x.id === el.dataset.id); closeSheet(); UI.tab = 'coach'; render(); setTimeout(() => { const t = document.getElementById('chatIn'); if (t) { t.value = `Sobre «${s.title}» del ${fmtDate(s.date)}: `; t.focus(); } }, 50); });
document.addEventListener('keydown', e => { if (e.target.id === 'chatIn' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.querySelector('[data-a="chatSend"]')?.click(); } });

/* ---------- Ajustes ---------- */
let SET = 'main', PE = null;
function settingsView() {
  const u = cloud.currentUser(), P = S.profile;
  if (SET === 'profile') return profileEdit();
  if (SET === 'trash') return sheetTop('Papelera') + ((S.trash || []).length ? S.trash.map(t => `<div class="row"><span class="grow"><b>${esc(t.s ? t.s.title : (t.many?.length || 0) + ' sesiones')}</b><span class="mut sm">${esc(t.by)} · ${new Date(t.at).toLocaleDateString('es-ES')}</span></span><button class="btn ghost sm" data-a="trashUndo" data-v="${t.at}">Recuperar</button></div>`).join('') : '<p class="mut">Vacía.</p>');
  if (SET === 'privacy') return sheetTop('Privacidad') + privacyHtml();
  const row = (e, t, sub, a, extra = '') => `<button class="row" data-a="${a}" ${extra}><span class="ki">${e}</span><span class="grow"><b>${t}</b><span class="mut sm">${sub}</span></span><span class="chev">›</span></button>`;
  return sheetTop('Ajustes') + `
    <div class="card">${row('🎯', 'Objetivo y perfil', `${esc(GOALS[P.goal].short)}${P.raceDate && P.goal !== 'hybrid' ? ' · ' + fmtDate(P.raceDate) : ''} · 5K ${esc(P.fiveK || 'estimado')}`, 'setProfile')}
      ${row('🔁', 'Rehacer el plan', 'Regenera las sesiones futuras no registradas', 'replan')}
      ${row('🧭', 'Volver a configurar desde cero', 'Repite las preguntas iniciales', 'reOnboard')}</div>
    <div class="card">${cloud.enabled() ? (u ? row('☁️', 'Cuenta', `${esc(u.email)} · sincronizado`, 'account') : row('☁️', 'Crear cuenta o entrar', 'Sincroniza entre dispositivos y usa el coach IA', 'account')) : '<p class="mut sm">Esta instalación guarda los datos solo en este dispositivo.</p>'}</div>
    <div class="card"><h3>Preferencias</h3>
      <label class="switch"><span>Tema</span><select class="in" style="width:auto;min-height:40px" data-ch="theme">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, t]) => `<option value="${v}" ${S.settings.theme === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="switch"><span>Ritmos en km/h (cinta) por defecto</span><input type="checkbox" ${S.settings.treadmill ? 'checked' : ''} data-ch="setTread"></label>
      <label class="switch"><span>Avisos por voz en la guía</span><input type="checkbox" ${S.settings.voice ? 'checked' : ''} data-ch="setVoice"></label></div>
    <div class="card">${row('⬇️', 'Exportar mis datos', 'Copia de seguridad en un archivo', 'export')}
      <label class="row" style="cursor:pointer"><span class="ki">⬆️</span><span class="grow"><b>Importar una copia</b><span class="mut sm">Sustituye los datos de este dispositivo</span></span><input type="file" accept="application/json,.json" data-ch="import" hidden><span class="chev">›</span></label>
      ${row('🗑️', 'Papelera', `${(S.trash || []).length} elementos`, 'setTrash')}
      ${row('🔒', 'Privacidad', 'Qué datos se guardan y dónde', 'setPrivacy')}
      <button class="row" data-a="wipe"><span class="ki">⚠️</span><span class="grow"><b style="color:var(--bad)">Borrar todo en este dispositivo</b></span></button></div>
    <p class="mut xs" style="text-align:center">${esc(CONFIG.appName)} · versión ${VERSION}</p>`;
}
function privacyHtml() {
  return `<div class="card prose sm">${esc(`Qué se guarda: tu perfil (objetivo, nivel, días, material, notas de salud que escribas), tu plan, tus registros y tus conversaciones con el coach.

Dónde: en este dispositivo. Si creas una cuenta, también en la base de datos del servicio, protegida para que solo tú puedas leer tus datos.

El coach IA: cuando le escribes o le pides un plan, se envía al proveedor de IA (Anthropic) un resumen de tu perfil, tu plan próximo y tus registros recientes para generar la respuesta. No se usa para otros fines.

Tus derechos: puedes exportar tus datos, borrarlos de este dispositivo y borrar tu cuenta con todos sus datos desde Ajustes › Cuenta.

Salud: esta app no es un producto sanitario ni sustituye a un profesional. Ante dolor o síntomas, consulta con un profesional.`)}${CONFIG.contact ? `\n\nContacto: ${esc(CONFIG.contact)}` : ''}</div>`;
}
function profileEdit() {
  const p = PE;
  return sheetTop('Objetivo y perfil') + `
    <label class="f">Nombre</label><input class="in" value="${esc(p.name || '')}" data-in="pe" data-k="name">
    <label class="f">Objetivo</label><div class="chips">${Object.entries(GOALS).map(([k, g]) => `<button class="chip ${p.goal === k ? 'on' : ''}" data-a="peSet" data-k="goal" data-v="${k}">${g.icon} ${g.short}</button>`).join('')}</div>
    ${p.goal === 'race' ? `<label class="f">Distancia</label><div class="chips">${[5, 10, 21.1, 42.2].map(k => `<button class="chip ${+p.raceKm === k ? 'on' : ''}" data-a="peSet" data-k="raceKm" data-v="${k}">${RACE_KM[k]}</button>`).join('')}</div>` : ''}
    ${p.goal !== 'hybrid' ? `<label class="f">Nombre de la carrera</label><input class="in" value="${esc(p.raceName || '')}" data-in="pe" data-k="raceName"><label class="f">Fecha</label><input class="in" type="date" value="${p.raceDate || ''}" data-in="pe" data-k="raceDate">` : ''}
    <label class="f">5K de referencia</label><input class="in" inputmode="numeric" placeholder="Ej.: 27:30" value="${esc(p.fiveK || '')}" data-in="pe" data-k="fiveK"><p class="hint">Al cambiarlo, todos los ritmos del plan se recalculan solos.</p>
    <label class="f">Nivel</label><div class="chips">${[['beginner', 'Empiezo'], ['intermediate', 'Intermedio'], ['advanced', 'Avanzado']].map(([v, t]) => `<button class="chip ${p.level === v ? 'on' : ''}" data-a="peSet" data-k="level" data-v="${v}">${t}</button>`).join('')}</div>
    <label class="f">Días de entreno</label><div class="chips days">${DAYS_S.map((d, i) => `<button class="chip ${p.days.includes(i) ? 'on' : ''}" data-a="peDay" data-v="${i}">${d}</button>`).join('')}</div>
    <label class="f">Sesión larga</label><select class="in" data-ch="peLong">${p.days.map(d => `<option value="${d}" ${+p.longDay === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select>
    <label class="f">Tiempo por sesión</label><div class="chips">${[30, 45, 60, 75, 90].map(m => `<button class="chip ${+p.sessionMin === m ? 'on' : ''}" data-a="peSet" data-k="sessionMin" data-v="${m}">${m} min</button>`).join('')}</div>
    <label class="f">Material</label><div class="chips">${[['gym', 'Gimnasio'], ['basic', 'Básico'], ['none', 'Sin material']].map(([v, t]) => `<button class="chip ${p.equipment === v ? 'on' : ''}" data-a="peSet" data-k="equipment" data-v="${v}">${t}</button>`).join('')}</div>
    <label class="switch"><span>Tengo ski erg, remo y trineo</span><input type="checkbox" ${p.sledAccess ? 'checked' : ''} data-ch="peSled"></label>
    <label class="f">Lesiones o notas</label><textarea class="in" data-in="pe" data-k="notes">${esc(p.notes || '')}</textarea>
    <div class="sp"></div><button class="btn" data-a="peSave">Guardar</button><div class="sp"></div><button class="btn ghost" data-a="peSave" data-re="1">Guardar y rehacer el plan</button>
    <p class="hint">«Rehacer» cambia las sesiones futuras que no has registrado ni creado a mano. Las anteriores quedan en la papelera.</p>`;
}
export function openSettings() { SET = 'main'; openSheet(settingsView, { full: true }); }
on('settings', openSettings);
on('setProfile', () => { SET = 'profile'; PE = JSON.parse(JSON.stringify(S.profile)); redrawSheet(); });
on('setTrash', () => { SET = 'trash'; redrawSheet(); });
on('setPrivacy', () => { SET = 'privacy'; redrawSheet(); });
on('in:pe', el => { PE[el.dataset.k] = el.value; });
on('peSet', el => { const v = el.dataset.v; PE[el.dataset.k] = isNaN(+v) ? v : +v; redrawSheet(); });
on('peDay', el => { const d = +el.dataset.v; PE.days = PE.days.includes(d) ? PE.days.filter(x => x !== d) : [...PE.days, d].sort(); if (!PE.days.includes(+PE.longDay)) PE.longDay = PE.days.at(-1); redrawSheet(); });
on('ch:peLong', el => { PE.longDay = +el.value; });
on('ch:peSled', el => { PE.sledAccess = el.checked; });
on('peSave', el => {
  if (PE.fiveK && !toSec(PE.fiveK)) { toast('El 5K se escribe como 27:30'); return; }
  if (PE.days.length < 2) { toast('Elige al menos 2 días'); return; }
  S.profile = PE; persist();
  if (el.dataset.re) { const n = regenerateLocal(today()); toast(`Plan rehecho: ${n} sesiones`); } else toast('Perfil guardado');
  SET = 'main'; redrawSheet();
});
on('replan', async () => {
  const ai = cloud.enabled() && cloud.currentUser();
  const how = ai ? (confirm('¿Rehacer las próximas semanas con el coach IA?\n\nAceptar: coach IA · Cancelar: plan automático') ? 'ai' : 'auto') : (confirm('¿Rehacer las sesiones futuras con el plan automático?') ? 'auto' : null);
  if (!how) return;
  closeSheet();
  if (how === 'auto') { const n = regenerateLocal(today()); toast(`Plan rehecho: ${n} sesiones`); return; }
  S.sessions.filter(s => s.source === 'ai' && s.date >= today() && !logOf(s)).forEach(s => (s.source = 'auto'));
  UI.tab = 'today'; runAiBlock();
});
on('reOnboard', () => { if (!confirm('Vas a repetir la configuración. Tus registros se conservan, pero el plan futuro se rehará.')) return; resetOnboarding(); S.onboarded = false; persist(); closeSheet(); });
on('trashUndo', el => { undoRemove(+el.dataset.v); toast('Recuperado'); redrawSheet(); });
on('export', () => { const b = new Blob([exportData()], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `ritmo-hibrido-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
on('ch:import', async el => { const f = el.files[0]; if (!f) return; if (!confirm('¿Sustituir los datos de este dispositivo por los de la copia?')) return; try { importData(await f.text()); toast('Copia importada'); closeSheet(); } catch (e) { toast(e.message); } });
on('wipe', () => { if (!confirm('¿Borrar todos los datos de este dispositivo? Si no tienes cuenta ni copia, no se pueden recuperar.')) return; resetAll(); closeSheet(); });
on('ch:theme', el => { S.settings.theme = el.value; persist({ noPush: true }); applyTheme(); });
on('ch:setTread', el => { S.settings.treadmill = el.checked; persist({ noPush: true }); });
on('ch:setVoice', el => { S.settings.voice = el.checked; persist({ noPush: true }); });
export function applyTheme() { const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }

/* ---------- cuenta ---------- */
let EMAIL = '';
function accountView() {
  const u = cloud.currentUser();
  if (u) {
    const q = S.quota;
    return sheetTop('Cuenta') + `<div class="card"><b>${esc(u.email)}</b><p class="mut sm" style="margin:4px 0 0">Tus datos se sincronizan entre dispositivos.</p>${q ? `<p class="sm" style="margin:10px 0 0">Coach este mes: ${q.chat}/${q.chatLimit} mensajes · ${q.plans}/${q.planLimit} planes</p>` : ''}</div>
      <button class="btn ghost" data-a="logout">Cerrar sesión</button><div class="sp"></div>
      <button class="btn danger" data-a="delAccount">Borrar mi cuenta y mis datos</button><p class="hint">Se borran tu cuenta, tu plan, tus registros y tus conversaciones del servidor. Este dispositivo conserva una copia hasta que la borres.</p>`;
  }
  return sheetTop('Entrar') + `<p>Te enviamos un enlace a tu email para entrar, sin contraseña.</p>
    <label class="f">Email</label><input class="in" type="email" autocomplete="email" value="${esc(EMAIL)}" data-in="email" placeholder="tu@email.com">
    <div class="sp"></div><button class="btn" data-a="sendLink">Enviarme el enlace</button>
    <p class="hint">Al entrar, lo que tienes en este dispositivo se une a tu cuenta.</p>`;
}
export function openAccount() { openSheet(accountView); if (cloud.currentUser()) cloud.coach('quota').then(() => redrawSheet()).catch(() => { }); }
on('account', openAccount);
on('in:email', el => { EMAIL = el.value.trim(); });
on('sendLink', async () => { if (!/^\S+@\S+\.\S+$/.test(EMAIL)) { toast('Escribe un email válido'); return; } try { await cloud.signIn(EMAIL); toast('Revisa tu correo y abre el enlace en este dispositivo', 5000); closeSheet(); } catch (e) { toast(e.message); } });
on('logout', async () => { await cloud.signOut(); toast('Sesión cerrada'); closeSheet(); });
on('delAccount', async () => { if (!confirm('¿Borrar tu cuenta y todos tus datos del servidor? No se puede deshacer.')) return; try { await cloud.deleteAccount(); toast('Cuenta borrada'); closeSheet(); } catch (e) { toast(e.message); } });
on('noop', () => { });
export { ask };
