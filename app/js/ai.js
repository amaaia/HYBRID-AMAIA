// Coach IA: prepara el contexto, pide planes por bloques y aplica los cambios que propone.
import { S, sorted, logOf, replaceFuture, updateSession, addSession, removeSession, byId, persist } from './store.js';
import { coach } from './cloud.js';
import { planWeeks, phaseOf, PHASE, generatePlan, GOALS, RACE_KM, normalize } from './engine.js';
import { addDays, today, iso, uid, diffDays, DAYS, clamp } from './util.js';
import { base5k } from './paces.js';
import { hms } from './util.js';

export const BLOCK_WEEKS = 6;

function profileTxt() {
  const P = S.profile;
  const goal = P.goal === 'race' ? `${GOALS.race.name} de ${RACE_KM[P.raceKm] || P.raceKm + ' km'}` : P.goal === 'hyrox' ? `${GOALS.hyrox.name} (formato ${P.hyroxFormat || 'individual'}, categoría ${P.division || 'open'})` : GOALS.hybrid.name;
  return [
    `HOY: ${today()}`,
    `PERSONA: ${P.name || 'sin nombre'}${P.age ? ', ' + P.age + ' años' : ''}`,
    `OBJETIVO: ${goal}${P.raceName ? ' · ' + P.raceName : ''}${P.raceDate && P.goal !== 'hybrid' ? ' · fecha ' + P.raceDate : ''}${P.targetTime ? ' · tiempo objetivo ' + P.targetTime : ''}`,
    `NIVEL: ${P.level}. 5K actual: ${P.fiveK || 'desconocido (estimado ' + hms(base5k(P)) + ')'}`,
    `DÍAS DISPONIBLES: ${(P.days || []).map(d => DAYS[d]).join(', ')}. Día preferido para la sesión larga: ${DAYS[P.longDay ?? 6]}. Duración habitual: ${P.sessionMin} min.`,
    `MATERIAL: ${{ gym: 'gimnasio completo', basic: 'mancuernas / kettlebell en casa', none: 'sin material' }[P.equipment]}. Acceso a ski erg, remo y trineo: ${P.sledAccess ? 'sí' : 'no'}.`,
    P.notes ? `NOTAS / LESIONES: ${P.notes}` : '',
  ].filter(Boolean).join('\n');
}
function logsTxt(days = 28) {
  const from = iso(new Date(Date.now() - days * 864e5));
  const rows = sorted().filter(s => s.date >= from && s.date <= today()).map(s => {
    const l = logOf(s);
    const st = !l ? (s.dismissed ? 'descartada' : 'sin registrar') : l.status === 'skipped' ? 'no realizada' : `hecha${l.duration ? ' ' + l.duration + ' min' : ''}${l.distance ? ' ' + l.distance + ' km' : ''}${l.rpe ? ' RPE ' + l.rpe : ''}${l.pain ? ' molestia ' + l.pain + '/3' : ''}${l.notes ? ' «' + String(l.notes).slice(0, 140) + '»' : ''}`;
    return `- ${s.date} ${s.title} (${s.kind}, ${s.duration} min): ${st}`;
  });
  return rows.length ? `ÚLTIMAS ${days / 7} SEMANAS:\n${rows.join('\n')}` : 'ÚLTIMAS SEMANAS: sin registros todavía.';
}
function upcomingTxt(days = 21) {
  const to = addDays(today(), days);
  const rows = sorted().filter(s => s.date >= today() && s.date <= to && !logOf(s)).map(s => `- id=${s.id} · ${s.date} · ${s.kind} · ${s.title} · ${s.duration} min${s.optional ? ' · opcional' : ''}${s.focus ? ' · ' + s.focus : ''}`);
  return `PRÓXIMAS SESIONES (${days} días):\n${rows.join('\n') || '- ninguna'}`;
}
function weeksTxt(from, to) {
  const P = S.profile, { start, weeks } = planWeeks(P), hasRace = P.goal !== 'hybrid' && !!P.raceDate, out = [];
  for (let w = 0; w < weeks; w++) {
    const a = addDays(start, w * 7), b = addDays(a, 6);
    if (b < from || a > to) continue;
    const ph = phaseOf(w, weeks, hasRace), deload = ph !== 'taper' && (w + 1) % 4 === 0;
    out.push(`- Semana ${w + 1} (${a} a ${b}): fase ${PHASE[ph]}${deload ? ' · DESCARGA' : ''}`);
  }
  return `ESTRUCTURA (${weeks} semanas en total):\n${out.join('\n')}`;
}

// rango del siguiente bloque a generar
export function nextBlockRange() {
  const P = S.profile, { end } = planWeeks(P);
  const aiDates = S.sessions.filter(s => s.source === 'ai').map(s => s.date).sort();
  let from = today();
  const lastAi = aiDates.at(-1);
  if (lastAi && lastAi >= today()) from = addDays(lastAi, 1);
  if (from < (P.startDate || from)) from = P.startDate;
  const to = [addDays(from, BLOCK_WEEKS * 7 - 1), end].sort()[0];
  return { from, to, done: from > end };
}
export function needsNextBlock() {
  const ai = S.sessions.filter(s => s.source === 'ai');
  if (!ai.length) return false;
  const last = ai.map(s => s.date).sort().at(-1), { end } = planWeeks(S.profile);
  return last < end && diffDays(last, today()) <= 7;
}

export async function generateBlockAI(onStep) {
  const { from, to, done } = nextBlockRange();
  if (done) throw new Error('El plan ya llega hasta tu objetivo');
  onStep?.('Preparando tu información…');
  const skeleton = generatePlan(S.profile, from).filter(s => s.date <= to).map(s => `- ${s.date} ${s.kind}: ${s.title} (${s.duration} min)`).join('\n');
  const context = [profileTxt(), weeksTxt(from, to), logsTxt(28), `ESQUELETO ORIENTATIVO (puedes mejorarlo):\n${skeleton}`].join('\n\n');
  onStep?.('El coach está diseñando tus semanas… (puede tardar un minuto)');
  const res = await coach('plan', { from, to, context });
  const list = (res.sessions || []).map(s => ({ ...s, source: 'ai' }));
  if (!list.length) throw new Error('El coach no ha devuelto sesiones. Inténtalo de nuevo.');
  const n = replaceFuture(list, from, to, 'Plan del coach IA');
  // el resto hasta el objetivo se completa con el plan automático para que el calendario esté entero
  const { end } = planWeeks(S.profile);
  if (to < end) {
    const rest = generatePlan(S.profile, addDays(to, 1));
    replaceFuture(rest, addDays(to, 1), null, 'Plan automático');
  }
  S.lastBlock = { at: Date.now(), from, to, summary: res.summary || '' };
  persist();
  return { n, from, to, summary: res.summary || '' };
}

/* ---------- chat ---------- */
export async function sendChat(text) {
  const msg = { id: uid(), role: 'user', text, t: Date.now() };
  S.chat.push(msg); persist();
  const context = [profileTxt(), upcomingTxt(21), logsTxt(21)].join('\n\n');
  const messages = S.chat.slice(-12).map(m => ({ role: m.role, text: m.text }));
  try {
    const res = await coach('chat', { context, messages });
    const changes = (res.changes || []).map(c => ({ ...c, status: 'pending' }));
    S.chat.push({ id: uid(), role: 'assistant', text: res.reply || '…', t: Date.now(), changes });
    persist();
  } catch (e) {
    S.chat.push({ id: uid(), role: 'assistant', text: e.message, t: Date.now(), error: true }); persist();
    throw e;
  }
}
export function applyChange(msgId, i) {
  const m = S.chat.find(x => x.id === msgId), c = m?.changes?.[i];
  if (!c || c.status !== 'pending') return false;
  if (c.op === 'add') { const s = addSession({ ...c.session, source: 'ai' }, 'Añadida por el coach IA'); c.newId = s.id; }
  else {
    const s = byId(c.id); if (!s) { c.status = 'failed'; persist(); return false; }
    if (logOf(s)) { c.status = 'failed'; persist(); return false; }
    if (c.op === 'remove') removeSession(s.id, 'Quitada por el coach IA');
    else { const n = normalize({ ...c.session, id: s.id, source: 'ai' }, S.profile); delete n.updatedAt; updateSession(s.id, n, 'Coach IA'); }
  }
  c.status = 'applied'; persist(); return true;
}
export function discardChange(msgId, i) { const c = S.chat.find(x => x.id === msgId)?.changes?.[i]; if (c) { c.status = 'dismissed'; persist(); } }
