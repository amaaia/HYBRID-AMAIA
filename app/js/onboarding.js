// Bienvenida y alta guiada en 6 pasos. Al terminar se crea el plan (automático al instante y, si se elige, mejorado por el coach IA).
import { S, persist, replaceState, importData } from './store.js';
import { A, on, render } from './ui.js';
import { esc, today, addDays, diffDays, DAYS, DAYS_S, toSec, toast, clone } from './util.js';
import { GOALS, RACE_KM, generatePlan } from './engine.js';
import { CONFIG } from './config.js';
import * as cloud from './cloud.js';
import { generateBlockAI } from './ai.js';

const OB = { step: 0, p: null, mode: 'auto', email: '', busy: '' };
const STEPS = 6;
const P = () => OB.p || (OB.p = clone(S.profile));

const opt = (on, a, v, e, t, sub) => `<button class="opt ${on ? 'on' : ''}" data-a="${a}" data-v="${v}"><span class="e">${e}</span><span><b>${t}</b><span class="mut sm" style="display:block">${sub}</span></span></button>`;
const chip = (on, a, v, t) => `<button class="chip ${on ? 'on' : ''}" data-a="${a}" data-v="${v}">${t}</button>`;

export function onboardingView() {
  const p = P(), s = OB.step;
  if (s === 0) return `<div class="ob welcome">
    <div class="brand"><i>⚡</i>${esc(CONFIG.appName)}</div>
    <h1>Tu plan de entrenamiento híbrido, hecho para ti.</h1>
    <p class="mut">Carrera, fuerza y competiciones de fitness híbrido en una sola app, con un coach que adapta el plan a cómo te va.</p>
    <div class="feat"><span>🗓️</span><div><b>Plan completo hasta tu objetivo</b><div class="mut sm">Por fases, con descargas y puesta a punto.</div></div></div>
    <div class="feat"><span>🎯</span><div><b>Ritmos calculados con tu 5K</b><div class="mut sm">En min/km o en km/h para la cinta.</div></div></div>
    <div class="feat"><span>🔊</span><div><b>Guía por voz y modo gimnasio</b><div class="mut sm">Series, descansos y avisos sin mirar el móvil.</div></div></div>
    <div class="feat"><span>💬</span><div><b>Coach con IA</b><div class="mut sm">Pregunta, cuéntale cómo estás y ajusta el plan.</div></div></div>
    <div class="foot" style="flex-direction:column">
      <button class="btn" data-a="obNext">Empezar</button>
      ${cloud.enabled() ? '<button class="btn ghost" data-a="obLogin">Ya tengo cuenta</button>' : ''}
      <label class="btn ghost" style="cursor:pointer">Restaurar una copia<input type="file" accept="application/json,.json" data-ch="obImport" hidden></label>
    </div></div>`;

  const head = `<div class="steps">${Array.from({ length: STEPS }, (_, i) => `<i class="${i < s ? 'on' : ''}"></i>`).join('')}</div>`;
  const foot = (next = 'Continuar', dis = false) => `<div class="foot"><button class="btn ghost" data-a="obBack">Atrás</button><button class="btn" data-a="obNext" ${dis ? 'disabled' : ''}>${next}</button></div>`;
  let body = '';

  if (s === 1) body = `<h2>¿Cuál es tu objetivo?</h2><p class="mut">Podrás cambiarlo cuando quieras.</p><div class="sp"></div>
    ${opt(p.goal === 'hyrox', 'obGoal', 'hyrox', '🏆', 'Competición de fitness híbrido', 'Carrera + estaciones (tipo HYROX): individual, dobles o relevos')}
    ${opt(p.goal === 'race', 'obGoal', 'race', '🏁', 'Carrera a pie', '5K, 10K, media maratón o maratón')}
    ${opt(p.goal === 'hybrid', 'obGoal', 'hybrid', '⚡', 'Ponerme en forma', 'Fuerza y resistencia sin fecha concreta, en ciclos de 12 semanas')}` + foot();

  if (s === 2) {
    const minD = addDays(today(), 14);
    if (p.goal === 'hybrid') body = `<h2>Forma física híbrida</h2><p class="mut">Te preparo un ciclo de 12 semanas que combina fuerza, carrera y circuitos. Al terminar puedes generar el siguiente.</p>
      <label class="f">¿Cuándo empiezas?</label><input class="in" type="date" value="${p.startDate || today()}" min="${today()}" data-in="obField" data-k="startDate">` + foot();
    else {
      const weeks = p.raceDate ? Math.floor(diffDays(p.raceDate, today()) / 7) : null;
      body = `<h2>${p.goal === 'race' ? 'Tu carrera' : 'Tu competición'}</h2>
      ${p.goal === 'race' ? `<label class="f">Distancia</label><div class="chips">${[5, 10, 21.1, 42.2].map(k => chip(+p.raceKm === k, 'obKm', k, RACE_KM[k])).join('')}</div>` : `
      <label class="f">Formato</label><div class="chips">${[['individual', 'Individual'], ['doubles', 'Dobles'], ['relay', 'Relevos']].map(([v, t]) => chip(p.hyroxFormat === v, 'obFmt', v, t)).join('')}</div>
      <label class="f">Categoría</label><div class="chips">${[['open', 'Open'], ['pro', 'Pro']].map(([v, t]) => chip((p.division || 'open') === v, 'obDiv', v, t)).join('')}</div>`}
      <label class="f">Nombre (opcional)</label><input class="in" value="${esc(p.raceName || '')}" placeholder="${p.goal === 'race' ? 'Ej.: Media de mi ciudad' : 'Ej.: Competición de febrero'}" data-in="obField" data-k="raceName">
      <label class="f">Fecha</label><input class="in" type="date" value="${p.raceDate || ''}" min="${minD}" data-in="obField" data-k="raceDate">
      ${weeks != null ? `<p class="hint">${weeks} semanas de preparación${weeks < 6 ? ' · es poco tiempo: el plan será corto y prudente' : ''}.</p>` : '<p class="hint">Como mínimo dentro de 2 semanas.</p>'}
      ${p.goal === 'race' ? `<label class="f">Tiempo objetivo (opcional)</label><input class="in" inputmode="numeric" placeholder="Ej.: 55:00 o 1:59:00" value="${esc(p.targetTime || '')}" data-in="obField" data-k="targetTime">` : ''}
      ${foot('Continuar', !p.raceDate || p.raceDate < minD || (p.goal === 'race' && !p.raceKm))}`;
    }
  }

  if (s === 3) {
    const ok = !p.fiveK || toSec(p.fiveK);
    body = `<h2>Tu punto de partida</h2>
    ${opt(p.level === 'beginner', 'obLevel', 'beginner', '🌱', 'Empiezo', 'Corro poco o nada, o vuelvo tras un parón')}
    ${opt(p.level === 'intermediate', 'obLevel', 'intermediate', '🔥', 'Intermedio', 'Entreno 2-4 días por semana desde hace meses')}
    ${opt(p.level === 'advanced', 'obLevel', 'advanced', '🚀', 'Avanzado', 'Entreno de forma estructurada y compito')}
    <label class="f">Tu mejor 5K reciente (opcional)</label><input class="in" inputmode="numeric" placeholder="Ej.: 27:30" value="${esc(p.fiveK || '')}" data-in="obField" data-k="fiveK">
    <p class="hint">${ok ? 'Sirve para calcular tus ritmos. Si no lo sabes, lo estimamos por tu nivel y lo afinas después.' : 'Escríbelo como minutos:segundos, por ejemplo 27:30.'}</p>
    <label class="f">Edad (opcional)</label><input class="in" type="number" min="14" max="90" value="${esc(p.age || '')}" data-in="obField" data-k="age">` + foot('Continuar', !ok);
  }

  if (s === 4) body = `<h2>¿Cuándo puedes entrenar?</h2><p class="mut">Elige entre 3 y 6 días.</p>
    <label class="f">Días</label><div class="chips days">${DAYS_S.map((d, i) => chip(p.days.includes(i), 'obDay', i, d)).join('')}</div>
    <p class="hint">${p.days.length} días: ${p.days.length < 3 ? 'elige al menos 3' : p.days.length > 6 ? 'máximo 6, deja al menos uno de descanso' : 'perfecto'}.</p>
    <label class="f">Día para la sesión larga</label><select class="in" data-ch="obLong">${p.days.map(d => `<option value="${d}" ${+p.longDay === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select>
    <label class="f">Tiempo por sesión</label><div class="chips">${[30, 45, 60, 75, 90].map(m => chip(+p.sessionMin === m, 'obMin', m, m + ' min')).join('')}</div>
    <label class="f">Hora habitual (opcional)</label><input class="in" type="time" value="${esc(p.time || '')}" data-in="obField" data-k="time">` + foot('Continuar', p.days.length < 3 || p.days.length > 6);

  if (s === 5) body = `<h2>Material y salud</h2>
    ${opt(p.equipment === 'gym', 'obEq', 'gym', '🏋️', 'Gimnasio', 'Barras, máquinas, mancuernas')}
    ${opt(p.equipment === 'basic', 'obEq', 'basic', '🏠', 'Material básico', 'Mancuernas o kettlebell en casa')}
    ${opt(p.equipment === 'none', 'obEq', 'none', '🤸', 'Sin material', 'Peso corporal y lo que tengas a mano')}
    ${p.goal !== 'race' ? `<label class="switch"><span><b>Tengo ski erg, remo y trineo</b><span class="mut sm" style="display:block">Si no, usamos sustitutos</span></span><input type="checkbox" ${p.sledAccess ? 'checked' : ''} data-ch="obSled"></label>` : ''}
    <label class="switch"><span><b>Añadir movilidad opcional</b><span class="mut sm" style="display:block">20 min un día de descanso</span></span><input type="checkbox" ${p.mobility ? 'checked' : ''} data-ch="obMob"></label>
    <label class="f">Lesiones o molestias (opcional)</label><textarea class="in" placeholder="Ej.: rodilla derecha sensible al bajar escaleras" data-in="obField" data-k="notes">${esc(p.notes || '')}</textarea>
    <p class="hint">Esta app no sustituye a un profesional sanitario. Si tienes una lesión o una condición médica, consulta antes de empezar.</p>` + foot();

  if (s === 6) {
    const ai = cloud.enabled(), user = cloud.currentUser();
    body = `<h2>Último paso</h2>
    <label class="f">¿Cómo te llamas?</label><input class="in" value="${esc(p.name || '')}" placeholder="Tu nombre" data-in="obField" data-k="name" autocomplete="given-name">
    <label class="f">¿Cómo creamos tu plan?</label>
    ${opt(OB.mode === 'auto', 'obMode', 'auto', '⚡', 'Plan automático', 'Al instante y sin cuenta. Se guarda en este dispositivo.')}
    ${ai ? opt(OB.mode === 'ai', 'obMode', 'ai', '💬', 'Diseñado por el coach IA', 'Más personalizado, en bloques de 6 semanas. Necesita una cuenta gratuita.') : ''}
    ${OB.mode === 'ai' && !user ? `<label class="f">Tu email</label><input class="in" type="email" autocomplete="email" placeholder="tu@email.com" value="${esc(OB.email)}" data-in="obEmail"><p class="hint">Te enviamos un enlace para entrar, sin contraseña. Mientras tanto ya tendrás el plan automático.</p>` : ''}
    ${OB.mode === 'ai' && user ? `<p class="hint">Sesión iniciada como ${esc(user.email)}.</p>` : ''}
    ${OB.busy ? `<p style="margin-top:16px"><span class="spin"></span> ${esc(OB.busy)}</p>` : ''}
    <div class="foot"><button class="btn ghost" data-a="obBack" ${OB.busy ? 'disabled' : ''}>Atrás</button><button class="btn" data-a="obFinish" ${OB.busy ? 'disabled' : ''}>Crear mi plan</button></div>`;
  }
  return `<div class="ob">${head}${body}</div>`;
}

const redraw = () => render();
const set = (k, v) => { P()[k] = v; redraw(); };
on('obNext', () => { OB.step = Math.min(STEPS, OB.step + 1); if (OB.step === 2 && P().goal === 'race' && !P().raceKm) P().raceKm = 10; if (OB.step === 2 && P().goal === 'hyrox' && !P().hyroxFormat) P().hyroxFormat = 'individual'; redraw(); scrollTo(0, 0); });
on('obBack', () => { OB.step = Math.max(0, OB.step - 1); redraw(); });
on('obGoal', el => set('goal', el.dataset.v));
on('obKm', el => set('raceKm', +el.dataset.v));
on('obFmt', el => set('hyroxFormat', el.dataset.v));
on('obDiv', el => set('division', el.dataset.v));
on('obLevel', el => set('level', el.dataset.v));
on('obEq', el => set('equipment', el.dataset.v));
on('obMin', el => set('sessionMin', +el.dataset.v));
on('obMode', el => { OB.mode = el.dataset.v; redraw(); });
on('obDay', el => {
  const d = +el.dataset.v, p = P();
  p.days = p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d].sort((a, b) => a - b);
  if (!p.days.includes(+p.longDay)) p.longDay = p.days.at(-1) ?? 6;
  redraw();
});
// los campos de texto no redibujan (para no perder el foco); solo actualizan el botón cuando hace falta
on('in:obField', el => { P()[el.dataset.k] = el.value; if (['raceDate', 'fiveK'].includes(el.dataset.k)) { clearTimeout(OB.t); OB.t = setTimeout(() => { const pos = el.selectionStart; redraw(); const n = document.querySelector(`[data-k="${el.dataset.k}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } } }, 500); } });
on('in:obEmail', el => { OB.email = el.value.trim(); });
on('ch:obLong', el => { P().longDay = +el.value; });
on('ch:obSled', el => { P().sledAccess = el.checked; });
on('ch:obMob', el => { P().mobility = el.checked; });
on('ch:obImport', async el => {
  const f = el.files[0]; if (!f) return;
  try { importData(await f.text()); toast('Copia restaurada'); } catch (e) { toast(e.message); }
});
on('obLogin', async () => {
  const email = prompt('Tu email para entrar (te enviamos un enlace):');
  if (!email) return;
  try { await cloud.signIn(email.trim()); toast('Revisa tu correo y abre el enlace'); } catch (e) { toast(e.message); }
});

on('obFinish', async () => {
  const p = P();
  p.startDate = p.goal === 'hybrid' ? (p.startDate || today()) : today();
  if (p.goal !== 'race') delete p.targetTime;
  S.profile = p; S.onboarded = true;
  S.sessions = generatePlan(p, p.startDate);
  S.logs = {}; persist();
  if (OB.mode === 'ai') {
    if (!cloud.currentUser()) {
      if (!/^\S+@\S+\.\S+$/.test(OB.email)) { toast('Escribe un email válido o elige el plan automático'); S.onboarded = false; persist(); return; }
      try { await cloud.signIn(OB.email); S.pendingAI = true; persist(); toast('Te hemos enviado un enlace. Al entrar, el coach diseñará tu plan.', 5000); }
      catch (e) { toast(e.message); }
    } else {
      OB.busy = 'El coach está diseñando tus primeras semanas…'; redraw();
      try { await generateBlockAI(t => { OB.busy = t; redraw(); }); toast('¡Plan listo!'); }
      catch (e) { toast(e.message + ' Te dejamos el plan automático.', 5000); }
      OB.busy = '';
    }
  }
  OB.step = 0; OB.p = null;
  render();
});
export const resetOnboarding = () => { OB.step = 1; OB.p = clone(S.profile); OB.mode = 'auto'; };
