// Guía de carrera paso a paso (voz, pitidos, vibración, pantalla encendida) y modo gimnasio (series, pesos y descansos).
import { S, byId, logOf, persist } from './store.js';
import { on, openSheet, redrawSheet, closeSheet } from './ui.js';
import { esc, durTxt, hms, toast } from './util.js';
import { runSteps, stepTxt, openLog } from './session.js';

/* ---------- audio y pantalla ---------- */
let AC = null, WL = null;
function beep(n = 1, hz = 880) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < n; i++) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = hz; o.connect(g); g.connect(AC.destination); const t = AC.currentTime + i * 0.25; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.start(t); o.stop(t + 0.22); }
  } catch (e) { }
  try { navigator.vibrate?.(n > 1 ? [150, 80, 150] : 150); } catch (e) { }
}
function say(t) {
  if (!S.settings.voice || !window.speechSynthesis) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) { }
}
async function wake(on) {
  try { if (on && navigator.wakeLock) WL = await navigator.wakeLock.request('screen'); else if (!on && WL) { await WL.release(); WL = null; } } catch (e) { }
}
const spoken = t => t.replace(/–/g, ' a ').replace(/\/km/g, ' el kilómetro').replace(/km\/h/g, 'kilómetros por hora');

/* ---------- guía de carrera ---------- */
let G = null;
const now = () => Date.now();
const gElapsed = () => (G.pausedAt || now()) - G.t0 - G.paused;
function gView() {
  if (!G) return '';
  const st = G.steps[G.i], nx = G.steps[G.i + 1], t = stepTxt(st), el = gElapsed() / 1000;
  const left = st.dur ? Math.max(0, st.dur - el) : null;
  return `<div class="sheet-top"><button class="btn ghost sm" data-a="guideStop">Salir</button><b>Paso ${G.i + 1} de ${G.steps.length}</b><span class="mut sm num">${hms(G.total / 1000 + el)}</span></div>
    <div class="prog">${G.steps.map((_, i) => `<i class="${i < G.i ? 'ok' : i === G.i ? 'cur' : ''}"></i>`).join('')}</div>
    <div class="focus"><div class="what">${esc(t.amount)} · ${esc(t.what)}</div>
      <div class="big">${left != null ? hms(left) : hms(el)}</div>
      <div class="tgt">${esc(t.target)}</div><p class="mut">${esc(t.zone)}${st.dist ? ' · pulsa «Siguiente» al completar la distancia' : ''}</p></div>
    ${nx ? `<div class="card flat"><span class="mut sm">Después</span><div><b>${esc(stepTxt(nx).amount)} · ${esc(stepTxt(nx).what)}</b> <span class="mut">${esc(stepTxt(nx).target)}</span></div></div>` : '<div class="card flat"><b>Último paso</b></div>'}
    <div class="seg" style="width:100%;margin:6px 0 12px"><button style="flex:1" class="${S.settings.treadmill ? '' : 'on'}" data-a="guideTread" data-v="0">min/km</button><button style="flex:1" class="${S.settings.treadmill ? 'on' : ''}" data-a="guideTread" data-v="1">Cinta km/h</button></div>
    <div class="grid2"><button class="btn ghost" data-a="guidePause">${G.pausedAt ? '▶ Seguir' : '⏸ Pausa'}</button><button class="btn" data-a="guideNext">${nx ? 'Siguiente ›' : 'Terminar ✓'}</button></div>
    <label class="switch"><span>Avisos por voz</span><input type="checkbox" ${S.settings.voice ? 'checked' : ''} data-ch="guideVoice"></label>`;
}
function announce() { const t = stepTxt(G.steps[G.i]); beep(2); say(`${t.amount}, ${t.what}. ${spoken(t.target)}`); }
function tick() {
  if (!G || G.pausedAt) return;
  const st = G.steps[G.i], el = gElapsed() / 1000;
  if (st.dur) { const left = st.dur - el; if (Math.ceil(left) === 3 && G.warned !== G.i) { G.warned = G.i; beep(1, 660); } if (left <= 0) return next(); }
  redrawSheet();
}
function next() {
  G.total += gElapsed(); G.i++; G.t0 = now(); G.paused = 0; G.pausedAt = null;
  if (G.i >= G.steps.length) return finish();
  announce(); redrawSheet();
}
function finish() {
  const id = G.id, min = Math.round(G.total / 60000);
  stop(); beep(3); say('Sesión terminada. ¡Buen trabajo!');
  if (!logOf(byId(id))) openLog(id, { duration: min || '' });
}
function stop() { clearInterval(G?.h); G = null; wake(false); }
export function startGuide(id) {
  const s = byId(id), steps = runSteps(s);
  if (!steps.length) { toast('Esta sesión no tiene tramos de carrera'); return; }
  G = { id, steps, i: 0, t0: now(), paused: 0, pausedAt: null, total: 0, h: setInterval(tick, 500) };
  wake(true); announce();
  openSheet(gView, { full: true, onClose: stop });
}
on('guideStart', el => startGuide(el.dataset.id));
on('guideNext', () => next());
on('guidePause', () => { if (G.pausedAt) { G.paused += now() - G.pausedAt; G.pausedAt = null; } else G.pausedAt = now(); redrawSheet(); });
on('guideStop', () => { if (confirm('¿Salir de la guía?')) closeSheet(); });
on('guideTread', el => { S.settings.treadmill = el.dataset.v === '1'; persist({ noPush: true }); redrawSheet(); });
on('ch:guideVoice', el => { S.settings.voice = el.checked; persist({ noPush: true }); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G) wake(true); });

/* ---------- modo gimnasio ---------- */
let M = null;
const lastLoad = name => {
  const all = Object.entries(S.logs).filter(([, l]) => l.sets && l.sets[name]).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
  const v = all[0]?.[1].sets[name]; return v ? v.filter(x => x.done) : null;
};
function exercises(s) {
  return (s.blocks || []).filter(b => b.type === 'exercises').flatMap(b => (b.items || []).map(it => ({ ...it, block: b.title, sets: Math.max(1, (+it.sets || 1) * (b.rounds || 1)) })));
}
function mView() {
  const e = M.list[M.i], sets = M.sets[e.name], prev = lastLoad(e.name), restLeft = M.restEnd ? Math.max(0, Math.ceil((M.restEnd - now()) / 1000)) : 0;
  const repsNum = r => parseInt(r, 10) || '';
  return `<div class="sheet-top"><button class="btn ghost sm" data-a="gymExit">Salir</button><b>Ejercicio ${M.i + 1} de ${M.list.length}</b><button class="btn ghost sm" data-a="gymFinish">Terminar</button></div>
    <div class="prog">${M.list.map((x, i) => `<i class="${M.sets[x.name].every(y => y.done) ? 'ok' : i === M.i ? 'cur' : ''}" data-a="gymJump" data-i="${i}" style="cursor:pointer"></i>`).join('')}</div>
    <span class="mut sm">${esc(e.block || '')}</span><h2 style="margin:2px 0 4px">${esc(e.name)}</h2>
    <p class="mut" style="margin:0 0 8px">${e.sets} × ${esc(e.reps)}${e.rest ? ' · descanso ' + durTxt(e.rest) : ''}${e.load ? ' · ' + esc(e.load) : ''}</p>
    ${e.note ? `<p class="sm">💡 ${esc(e.note)}</p>` : ''}
    <p class="sm ${prev ? '' : 'mut'}">${prev ? 'Última vez: ' + prev.map(x => `${x.kg || '—'} kg × ${x.reps || '?'}`).join(' · ') : 'Primera vez: empieza con un peso que te deje 2-3 repeticiones de margen.'}</p>
    ${sets.map((x, i) => `<div class="set ${x.done ? 'ok' : ''}"><span class="mut" style="text-align:center;font-weight:700">${i + 1}</span>
      <div class="stp"><button data-a="gymAdj" data-i="${i}" data-k="kg" data-d="-2.5" aria-label="menos peso">−</button><b>${x.kg === '' ? '—' : String(x.kg).replace('.', ',')}<small>kg</small></b><button data-a="gymAdj" data-i="${i}" data-k="kg" data-d="2.5" aria-label="más peso">+</button></div>
      <div class="stp"><button data-a="gymAdj" data-i="${i}" data-k="reps" data-d="-1" aria-label="menos repeticiones">−</button><b>${x.reps === '' ? repsNum(e.reps) || '—' : x.reps}<small>reps</small></b><button data-a="gymAdj" data-i="${i}" data-k="reps" data-d="1" aria-label="más repeticiones">+</button></div>
      <button class="chk" data-a="gymDone" data-i="${i}" aria-label="serie hecha">${x.done ? '✓' : '○'}</button></div>`).join('')}
    <button class="btn ghost sm" data-a="gymAddSet">+ Añadir serie</button>
    ${M.restEnd ? `<div class="card flat focus" style="margin-top:12px"><span class="mut">Descanso</span><div class="big" style="font-size:56px;margin:6px 0">${hms(restLeft)}</div><div class="k" style="justify-content:center"><button class="btn ghost sm" data-a="gymRest" data-d="-15">−15 s</button><button class="btn ghost sm" data-a="gymRest" data-d="15">+15 s</button><button class="btn sm" data-a="gymRest" data-d="0">Saltar</button></div></div>` : ''}
    <div class="sp"></div><div class="grid2"><button class="btn ghost" data-a="gymPrev" ${M.i ? '' : 'disabled'}>‹ Anterior</button><button class="btn" data-a="gymNext">${M.i < M.list.length - 1 ? 'Siguiente ›' : 'Terminar ✓'}</button></div>`;
}
export function startGym(id) {
  const s = byId(id), list = exercises(s);
  if (!list.length) { toast('Esta sesión no tiene ejercicios'); return; }
  const sets = {};
  list.forEach(e => { const prev = lastLoad(e.name); sets[e.name] = sets[e.name] || Array.from({ length: e.sets }, (_, i) => ({ kg: prev?.[i]?.kg ?? prev?.[0]?.kg ?? '', reps: '', done: false })); });
  M = { id, list, i: 0, sets, restEnd: 0, t0: now(), h: setInterval(() => { if (M?.restEnd) { if (now() >= M.restEnd) { M.restEnd = 0; beep(2); say('A por la siguiente serie'); } redrawSheet(); } }, 1000) };
  wake(true);
  openSheet(mView, { full: true, onClose: () => { clearInterval(M?.h); M = null; wake(false); } });
}
on('gymStart', el => startGym(el.dataset.id));
on('gymAdj', el => {
  const e = M.list[M.i], x = M.sets[e.name][+el.dataset.i], k = el.dataset.k, d = +el.dataset.d;
  if (k === 'reps') { const base = x.reps === '' ? parseInt(e.reps, 10) || 0 : +x.reps; x.reps = Math.max(0, base + d); }
  else { const base = x.kg === '' ? 0 : +x.kg; x.kg = Math.max(0, Math.round((base + d) * 2) / 2); }
  redrawSheet();
});
on('gymDone', el => {
  const e = M.list[M.i], x = M.sets[e.name][+el.dataset.i];
  x.done = !x.done; if (x.done && x.reps === '') x.reps = parseInt(e.reps, 10) || '';
  if (x.done && e.rest && !M.sets[e.name].every(y => y.done)) M.restEnd = now() + e.rest * 1000;
  if (M.sets[e.name].every(y => y.done)) { M.restEnd = 0; beep(1); }
  redrawSheet();
});
on('gymAddSet', () => { const e = M.list[M.i], a = M.sets[e.name], l = a.at(-1); a.push({ kg: l?.kg ?? '', reps: '', done: false }); redrawSheet(); });
on('gymRest', el => { const d = +el.dataset.d; M.restEnd = d === 0 ? 0 : Math.max(now(), M.restEnd + d * 1000); redrawSheet(); });
on('gymPrev', () => { M.i = Math.max(0, M.i - 1); M.restEnd = 0; redrawSheet(); });
on('gymJump', el => { M.i = +el.dataset.i; M.restEnd = 0; redrawSheet(); });
on('gymNext', () => { if (M.i < M.list.length - 1) { M.i++; M.restEnd = 0; redrawSheet(); } else gymFinish(); });
on('gymFinish', () => gymFinish());
on('gymExit', () => { if (confirm('¿Salir sin guardar?')) closeSheet(); });
function gymFinish() {
  const id = M.id, min = Math.max(1, Math.round((now() - M.t0) / 60000)), sets = {};
  Object.entries(M.sets).forEach(([k, a]) => { sets[k] = a.map(x => ({ kg: x.kg === '' ? '' : +x.kg, reps: x.reps === '' ? '' : +x.reps, done: !!x.done })); });
  const n = Object.values(sets).flat().filter(x => x.done).length;
  closeSheet();
  openLog(id, { duration: min, sets, notes: '' });
  toast(`${n} series registradas: elige el esfuerzo y guarda`);
}
