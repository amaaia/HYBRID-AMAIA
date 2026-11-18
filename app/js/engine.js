// Generador de planes local (sin IA). También define el formato de sesión que usa toda la app
// y que la IA debe devolver. Contenido de entrenamiento propio, pensado para corredores populares
// y atletas de fitness híbrido de nivel principiante a avanzado.
import { addDays, monday, iso, dt, diffDays, uid, weekday, clamp } from './util.js';
import { kmForSeconds } from './paces.js';

/* ---------- formato de sesión ----------
session = {
  id, date:'YYYY-MM-DD', time:'HH:MM'|'', kind:'run'|'strength'|'hybrid'|'conditioning'|'mobility'|'race',
  title, focus, duration (min), distance (km estimados), intensity:'easy'|'moderate'|'hard',
  optional:boolean, phase, week, notes,
  blocks:[{ title, type:'run'|'exercises'|'text', rounds, steps:[{dur?:seg, dist?:km, zone, label?}],
            items:[{name, sets, reps, rest, load, note}], text }],
  source:'auto'|'ai'|'user', updatedAt
} */

export const GOALS = {
  hyrox: { name: 'Carrera de fitness híbrido', short: 'Híbrido (tipo HYROX)', icon: '🏆' },
  race: { name: 'Carrera a pie', short: 'Carrera', icon: '🏁' },
  hybrid: { name: 'Forma física híbrida', short: 'Fuerza + resistencia', icon: '⚡' },
};
export const RACE_KM = { 5: '5K', 10: '10K', 21.1: 'Media maratón', 42.2: 'Maratón' };

export const KIND = {
  run: { name: 'Carrera', icon: '🏃' },
  strength: { name: 'Fuerza', icon: '💪' },
  hybrid: { name: 'Híbrido', icon: '🔥' },
  conditioning: { name: 'Acondicionamiento', icon: '⚡' },
  mobility: { name: 'Movilidad', icon: '🧘' },
  race: { name: 'Competición', icon: '🏁' },
};

/* ---------- ejercicios por material ---------- */
const EX = {
  squat: { gym: 'Sentadilla trasera con barra', basic: 'Sentadilla goblet', none: 'Sentadilla con pausa de 2 s' },
  hinge: { gym: 'Peso muerto rumano con barra', basic: 'Peso muerto rumano con mancuernas', none: 'Puente de glúteo a una pierna' },
  lunge: { gym: 'Zancada búlgara con mancuernas', basic: 'Zancada atrás con mancuernas', none: 'Zancada atrás alterna' },
  hip: { gym: 'Hip thrust con barra', basic: 'Hip thrust con mancuerna', none: 'Hip thrust a una pierna' },
  step: { gym: 'Step-up al cajón con mancuernas', basic: 'Step-up con mancuernas', none: 'Step-up a una silla firme' },
  push: { gym: 'Press de banca', basic: 'Press con mancuernas en banco o suelo', none: 'Flexiones (manos elevadas si hace falta)' },
  ohp: { gym: 'Press militar con barra', basic: 'Press de hombros con mancuernas', none: 'Flexiones en pica' },
  pull: { gym: 'Dominadas (asistidas si hace falta)', basic: 'Remo con mancuerna a una mano', none: 'Remo invertido bajo una mesa' },
  row: { gym: 'Remo en polea baja', basic: 'Remo inclinado con mancuernas', none: 'Remo con toalla en una puerta' },
  core: { gym: 'Pallof press en polea', basic: 'Dead bug con mancuerna', none: 'Dead bug' },
  plank: { gym: 'Plancha con toque de hombro', basic: 'Plancha lateral', none: 'Plancha frontal' },
  carry: { gym: 'Paseo del granjero pesado', basic: 'Paseo del granjero con mancuernas', none: 'Paseo con mochila cargada' },
  calf: { gym: 'Elevación de gemelos en máquina', basic: 'Elevación de gemelos a una pierna con mancuerna', none: 'Elevación de gemelos a una pierna' },
  power: { gym: 'Saltos al cajón', basic: 'Swing con kettlebell o mancuerna', none: 'Saltos de longitud con aterrizaje controlado' },
};
const ex = (k, eq) => EX[k][eq] || EX[k].basic;

/* ---------- estaciones de carrera híbrida ---------- */
export const STATIONS = [
  { k: 'ski', name: 'Ski erg', dose: 1000, unit: 'm', alt: { basic: 'Tirones con banda elástica (simulación ski)', none: 'Burpees sin salto' }, altDose: { basic: '3 min', none: '15 reps' } },
  { k: 'push', name: 'Empuje de trineo', dose: 50, unit: 'm', alt: { basic: 'Sprint en cuesta o empuje de disco', none: 'Sprint en cuesta' }, altDose: { basic: '4 × 15 s', none: '4 × 15 s' } },
  { k: 'pull', name: 'Arrastre de trineo', dose: 50, unit: 'm', alt: { basic: 'Remo con mancuerna pesado', none: 'Remo invertido' }, altDose: { basic: '2 × 12 por brazo', none: '2 × 10' } },
  { k: 'bbj', name: 'Burpee con salto de longitud', dose: 80, unit: 'm', alt: {}, altDose: {} },
  { k: 'row', name: 'Remo ergómetro', dose: 1000, unit: 'm', alt: { basic: 'Swing con kettlebell', none: 'Burpees' }, altDose: { basic: '30 reps', none: '15 reps' } },
  { k: 'carry', name: 'Paseo del granjero', dose: 200, unit: 'm', alt: { none: 'Paseo con mochila o garrafas' }, altDose: {} },
  { k: 'lunge', name: 'Zancadas con saco', dose: 100, unit: 'm', alt: { basic: 'Zancadas con mancuerna al pecho', none: 'Zancadas con mochila' }, altDose: {} },
  { k: 'wb', name: 'Wall balls', dose: 100, unit: 'reps', alt: { basic: 'Thrusters con mancuernas', none: 'Sentadilla + press con mochila' }, altDose: { basic: '0.5', none: '0.5' } },
];
function station(st, frac, eq, sledAccess) {
  const noMachine = !sledAccess && ['ski', 'push', 'pull', 'row'].includes(st.k);
  const useAlt = (eq !== 'gym' || noMachine) && st.alt[eq === 'gym' ? 'basic' : eq];
  const e = eq === 'gym' ? 'basic' : eq;
  if (useAlt) {
    const d = st.altDose[e];
    const dose = d && /^0\.\d$/.test(d) ? `${Math.round(st.dose * frac * +d)} ${st.unit}` : d || `${Math.round(st.dose * frac)} ${st.unit}`;
    return { name: st.alt[e], reps: dose, note: `Sustituye a: ${st.name}`, est: Math.round(150 * frac / 0.5) };
  }
  const v = st.unit === 'reps' ? Math.round(st.dose * frac / 5) * 5 : Math.round(st.dose * frac / 10) * 10;
  return { name: st.name, reps: `${v} ${st.unit}`, note: 'Ritmo que podrías mantener en carrera', est: Math.round(240 * frac) };
}

/* ---------- bloques de carrera ---------- */
const run = (min, zone, label) => ({ dur: Math.round(min * 60), zone, label });
const runKm = (km, zone, label) => ({ dist: km, zone, label });
const B = {
  run: (title, steps, rounds = 1) => ({ title, type: 'run', rounds, steps }),
  ex: (title, items, rounds = 1) => ({ title, type: 'exercises', rounds, items }),
  text: (title, text) => ({ title, type: 'text', text }),
};

// duración estimada (min) y km de una sesión a partir de sus bloques
export function measure(s, profile) {
  let sec = 0, km = 0;
  for (const b of s.blocks || []) {
    const r = b.rounds || 1;
    if (b.type === 'run') for (const st of b.steps || []) {
      if (st.dur) { sec += st.dur * r; km += kmForSeconds(profile, st.zone, st.dur) * r; }
      else if (st.dist) { const t = st.dist / kmForSeconds(profile, st.zone, 1); sec += t * r; km += st.dist * r; }
    }
    if (b.type === 'exercises') for (const it of b.items || []) {
      const sets = +it.sets || 1, rest = +it.rest || 60;
      sec += r * (it.est ? +it.est : sets * (45 + rest));
    }
  }
  return { min: Math.round(sec / 60), km: Math.round(km * 10) / 10 };
}

/* ---------- constructores de sesiones ---------- */
function easyRun(P, ctx) {
  const min = clamp(Math.round(P.sessionMin * 0.75 * ctx.vf / 5) * 5, 20, 70);
  const steps = [run(min, 'easy')];
  const blocks = [B.run('Rodaje', steps)];
  if (ctx.phase !== 'base' && ctx.phase !== 'taper') blocks.push(B.run('Progresivos', [run(20 / 60, 'rep', '20 s rápidos y relajados'), run(1, 'recovery', 'trote o andando')], 4));
  return { kind: 'run', title: 'Rodaje suave', focus: 'Base aeróbica', intensity: 'easy', blocks, notes: 'Si dudas, más lento. Debes poder hablar en frases completas.' };
}
function longRun(P, ctx) {
  const g = P.goal, km = +P.raceKm || 10;
  const cap = g === 'race' ? (km >= 42 ? 160 : km >= 21 ? 120 : km >= 10 ? 80 : 60) : 90;
  const base = g === 'race' ? (km >= 42 ? 75 : km >= 21 ? 60 : km >= 10 ? 50 : 40) : 50;
  const min = clamp(Math.round((base + (cap - base) * ctx.prog) * ctx.vf / 5) * 5, 35, cap);
  const blocks = [];
  if (g === 'race' && km >= 21 && (ctx.phase === 'build' || ctx.phase === 'peak')) {
    const rp = ctx.phase === 'peak' ? 30 : 20;
    blocks.push(B.run('Tirada larga con ritmo de carrera', [run(min - rp - 10, 'easy'), run(rp, `race:${km}`, 'ritmo objetivo'), run(10, 'easy')]));
  } else if (ctx.phase === 'build' || ctx.phase === 'peak') {
    blocks.push(B.run('Tirada larga progresiva', [run(min - 15, 'easy'), run(15, 'steady', 'termina más vivo')]));
  } else blocks.push(B.run('Tirada larga', [run(min, 'easy')]));
  return { kind: 'run', title: 'Tirada larga', focus: 'Resistencia', intensity: 'moderate', blocks, notes: 'Lleva agua si pasa de 75 min. Come algo en la hora siguiente.' };
}
function qualityRun(P, ctx, variant = 0) {
  const w = ctx.wInPhase, g = P.goal, km = +P.raceKm || 5;
  const wu = run(12, 'easy', 'calentamiento'), cd = run(8, 'easy', 'vuelta a la calma');
  let title, focus, main, rounds = 1, extra = null;
  if (ctx.phase === 'taper') {
    title = 'Puesta a punto'; focus = 'Chispa sin fatiga';
    main = [run(2, 'interval'), run(2, 'recovery', 'trote')]; rounds = 4;
  } else if (ctx.phase === 'base') {
    title = 'Fartlek'; focus = 'Cambios de ritmo';
    main = [run(1, 'interval', 'vivo'), run(1, 'easy', 'suave')]; rounds = clamp(6 + w, 6, 10);
  } else if ((ctx.week + variant) % 2 === 0) {
    title = 'Series'; focus = 'Potencia aeróbica';
    if (g === 'race' && km <= 5 && ctx.phase === 'peak') { main = [runKm(1, 'interval'), run(2, 'recovery', 'trote suave')]; rounds = clamp(4 + Math.floor(w / 2), 4, 6); title = 'Series de 1 km'; }
    else { main = [run(3, 'interval'), run(2, 'recovery', 'trote suave')]; rounds = clamp(4 + Math.floor(w / 2), 4, 6); title = `Series de 3 min`; }
  } else {
    title = 'Tempo'; focus = 'Umbral';
    const t = clamp(15 + w * 3, 15, 30);
    if (ctx.phase === 'peak' && g === 'race' && km >= 10) { main = [run(t / 2, 'threshold'), run(2, 'easy', 'suave')]; rounds = 2; title = 'Umbral en dos bloques'; }
    else main = [run(t, 'tempo')];
  }
  if (g === 'hyrox' && ctx.phase !== 'base' && ctx.phase !== 'taper' && (ctx.week + variant) % 2 === 1) {
    title = 'Kilómetros a ritmo de carrera híbrida'; focus = 'Ritmo de competición';
    main = [runKm(1, 'hybrid'), run(1.5, 'recovery', 'andando o trote')]; rounds = clamp(4 + Math.floor(w / 2), 4, 8);
  }
  if (ctx.phase !== 'taper') extra = B.run('Progresivos', [run(20 / 60, 'rep', '20 s rápidos'), run(40 / 60, 'recovery')], 3);
  const blocks = [B.run('Calentamiento', [wu]), ...(extra && ctx.phase !== 'base' ? [extra] : []), B.run('Parte principal', main, rounds), B.run('Vuelta a la calma', [cd])];
  return { kind: 'run', title, focus, intensity: 'hard', blocks, notes: 'La última repetición debe parecerse a la primera. Si el ritmo se cae, corta una.' };
}
function strength(P, ctx, ab) {
  const eq = P.equipment || 'basic';
  const sch = { base: [3, '10-12', 75], build: [4, '6-8', 120], peak: [3, '4-6', 150], taper: [2, '5', 120] }[ctx.phase] || [3, '8-10', 90];
  const [sets, reps, rest] = sch;
  const runner = P.goal === 'race';
  const A = [ex('squat', eq), ex('push', eq), ex('hinge', eq), ex('pull', eq)];
  const Bx = [ex('lunge', eq), ex('ohp', eq), ex('hip', eq), ex('row', eq)];
  const main = (ab === 'A' ? A : Bx).map((n, i) => ({ name: n, sets: runner && i % 2 ? sets - 1 : sets, reps, rest, load: '', note: i === 0 ? 'Deja 2 repeticiones en reserva' : '' }));
  const acc = ab === 'A'
    ? [{ name: ex('calf', eq), sets: 3, reps: '12-15', rest: 45 }, { name: ex('core', eq), sets: 3, reps: '8 por lado', rest: 45 }]
    : [{ name: ex('carry', eq), sets: 3, reps: '40 m', rest: 60 }, { name: ex('plank', eq), sets: 3, reps: '30-40 s', rest: 45 }];
  if (ctx.phase === 'build' || ctx.phase === 'peak') acc.unshift({ name: ex('power', eq), sets: 3, reps: '5', rest: 60, note: 'Explosivo, calidad antes que cansancio' });
  return {
    kind: 'strength', title: `Fuerza ${ab}`, focus: ab === 'A' ? 'Sentadilla, empuje y bisagra' : 'Unilateral, hombro y cadera', intensity: 'moderate',
    blocks: [B.text('Calentamiento', '5 min de cardio suave + 2 series ligeras del primer ejercicio.'), B.ex('Bloque principal', main), B.ex('Accesorios', acc)],
    notes: 'Sube el peso cuando completes todas las series con 2 repeticiones de margen.',
  };
}
function hybridSession(P, ctx) {
  const eq = P.equipment || 'basic', frac = { base: 0.4, build: 0.6, peak: 0.8, taper: 0.35 }[ctx.phase] || 0.5;
  const rounds = clamp(Math.round(({ base: 4, build: 5, peak: 6, taper: 3 }[ctx.phase] || 4) * (P.sessionMin || 60) / 60 * (ctx.deload ? 0.75 : 1)), 2, 8);
  const order = ctx.week % 2 ? [0, 1, 2, 3, 4, 5, 6, 7] : [4, 6, 0, 7, 1, 5, 2, 3];
  const pick = order.slice(0, rounds).map(i => station(STATIONS[i], frac, eq, P.sledAccess));
  const blocks = [B.run('Calentamiento', [run(8, 'easy')]), B.text('Activación', '2 rondas: 10 sentadillas, 10 zancadas, 5 burpees, 20 s de plancha.')];
  pick.forEach((st, i) => {
    blocks.push(B.run(`Ronda ${i + 1} · carrera`, [runKm(ctx.phase === 'base' ? 0.6 : ctx.phase === 'taper' ? 0.5 : 1, 'hybrid')]));
    blocks.push(B.ex(`Ronda ${i + 1} · estación`, [{ name: st.name, sets: 1, reps: st.reps, rest: 0, note: st.note }]));
  });
  blocks.push(B.run('Vuelta a la calma', [run(5, 'recovery')]));
  return {
    kind: 'hybrid', title: 'Carrera + estaciones', focus: 'Correr con fatiga (compromised running)', intensity: 'hard', blocks,
    notes: 'Sal de cada estación andando 10 s y entra en ritmo poco a poco. Apunta el tiempo total para comparar.',
  };
}
function conditioning(P, ctx) {
  const eq = P.equipment || 'basic', min = clamp(Math.round(P.sessionMin * 0.45 / 2) * 2, 16, 30);
  const items = [
    { name: ex('power', eq), sets: 1, reps: '10', rest: 0 },
    { name: ex('push', eq), sets: 1, reps: '10', rest: 0 },
    { name: ex('lunge', eq), sets: 1, reps: '12', rest: 0 },
    { name: ex('row', eq), sets: 1, reps: '12', rest: 0 },
    { name: 'Burpees', sets: 1, reps: '8', rest: 60 },
  ];
  return {
    kind: 'conditioning', title: `Circuito ${min} min`, focus: 'Capacidad de trabajo', intensity: 'hard', duration: min + 12,
    blocks: [B.text('Calentamiento', '6 min: movilidad + 2 rondas suaves del circuito.'), B.ex(`Circuito · tantas rondas como puedas en ${min} min`, items, 1), B.text('Vuelta a la calma', '5 min andando y estiramientos suaves.')],
    notes: 'Ritmo constante: mejor 5 rondas iguales que 3 rápidas y 2 arrastradas.',
  };
}
function raceDay(P) {
  const hy = P.goal === 'hyrox', km = +P.raceKm || 5;
  const text = hy
    ? 'Calienta 15 min: trote suave, movilidad y 2 tramos de 20 s rápidos.\n\nPrimer km más prudente de lo que te pide el cuerpo. En las estaciones, ritmo constante y respiración controlada. En los wall balls, series cortas con descansos breves antes de fallar.\n\nDespués: registra el tiempo total y, si puedes, los parciales.'
    : `Calienta 12-15 min suave y 3 progresivos de 20 s.\n\nPrimer km 5-10 s/km más lento que el objetivo, luego ritmo constante y aprieta al final si queda margen.\n\nDespués: registra tu tiempo. Si mejora tu 5K de referencia, actualízalo en tu perfil para recalcular los ritmos.`;
  return {
    kind: 'race', title: P.raceName || (hy ? 'Competición' : `Carrera ${RACE_KM[km] || km + ' km'}`), focus: 'Día de competición', intensity: 'hard',
    blocks: hy ? [B.text('Estrategia', text)] : [B.run('Carrera', [runKm(km, `race:${km}`, 'ritmo objetivo')]), B.text('Estrategia', text)],
    notes: '¡A disfrutar! Todo el trabajo ya está hecho.',
  };
}
function mobility() {
  return { kind: 'mobility', title: 'Movilidad y core', focus: 'Recuperación activa', intensity: 'easy', optional: true,
    blocks: [B.text('20 min', '5 min de bici o paseo suave. Después 2 rondas: 10 círculos de cadera, 8 gatos-camello, 30 s de estiramiento de flexor de cadera por lado, 10 dead bugs, 30 s de plancha lateral por lado.')], notes: 'Opcional. Si estás cansada o cansado, mejor descansa.' };
}

/* ---------- plantillas semanales ---------- */
const TEMPLATES = {
  hyrox: { 3: ['hybrid', 'quality', 'strA'], 4: ['hybrid', 'quality', 'strA', 'long'], 5: ['hybrid', 'quality', 'strA', 'long', 'strB'], 6: ['hybrid', 'quality', 'strA', 'long', 'strB', 'easy'] },
  race: { 3: ['quality', 'easy', 'long'], 4: ['quality', 'easy', 'long', 'strA'], 5: ['quality', 'easy', 'long', 'strA', 'easy'], 6: ['quality', 'easy', 'long', 'strA', 'quality2', 'easy'] },
  hybrid: { 3: ['strA', 'quality', 'cond'], 4: ['strA', 'quality', 'strB', 'cond'], 5: ['strA', 'quality', 'strB', 'cond', 'long'], 6: ['strA', 'quality', 'strB', 'cond', 'long', 'easy'] },
};
const HARD = new Set(['hybrid', 'quality', 'quality2', 'cond', 'long']);

// coloca los tipos en los días elegidos separando las sesiones duras
function assignDays(types, days, longDay) {
  const slots = [...days].sort((a, b) => a - b), out = new Map();
  const ld = slots.includes(longDay) ? longDay : slots[slots.length - 1];
  const rest = [...types];
  const li = rest.indexOf('long');
  if (li >= 0) { out.set(ld, 'long'); rest.splice(li, 1); }
  const free = slots.filter(d => !out.has(d));
  const hard = rest.filter(t => HARD.has(t)), soft = rest.filter(t => !HARD.has(t));
  const near = d => Math.min(...[...out.entries()].filter(([, t]) => HARD.has(t)).map(([x]) => Math.min(Math.abs(x - d), 7 - Math.abs(x - d))), 9);
  for (const t of hard) { free.sort((a, b) => near(b) - near(a) || a - b); const d = free.shift(); if (d != null) out.set(d, t); }
  for (const t of soft) { const d = free.shift(); if (d != null) out.set(d, t); }
  return out;
}

export function planWeeks(P) {
  const start = monday(P.startDate || iso(new Date()));
  const end = P.goal !== 'hybrid' && P.raceDate ? P.raceDate : addDays(start, 12 * 7 - 1);
  return { start, end, weeks: clamp(Math.ceil((diffDays(end, start) + 1) / 7), 1, 40) };
}
export function phaseOf(i, W, hasRace) {
  if (hasRace && i === W - 1) return 'taper';
  if (hasRace && W >= 10 && i === W - 2) return 'taper';
  const f = i / Math.max(1, W - (hasRace ? 2 : 0));
  return f < 0.4 ? 'base' : f < 0.78 ? 'build' : 'peak';
}
export const PHASE = { base: 'Base', build: 'Desarrollo', peak: 'Específico', taper: 'Puesta a punto' };

// genera las sesiones entre fromDate (incluida) y el final del plan
export function generatePlan(P, fromDate) {
  const { start, end, weeks } = planWeeks(P), hasRace = P.goal !== 'hybrid' && !!P.raceDate;
  const days = (P.days && P.days.length ? P.days : [1, 3, 5, 6]).slice(0, 6);
  const tpl = TEMPLATES[P.goal || 'hybrid'][clamp(days.length, 3, 6)];
  const from = fromDate || P.startDate || iso(new Date());
  const out = [];
  const phaseCount = {};
  for (let w = 0; w < weeks; w++) {
    const phase = phaseOf(w, weeks, hasRace);
    phaseCount[phase] = (phaseCount[phase] || 0) + 1;
    const deload = phase !== 'taper' && (w + 1) % 4 === 0;
    const vf = phase === 'taper' ? (w === weeks - 1 ? 0.5 : 0.7) : deload ? 0.75 : 1 + 0.03 * (w % 4);
    const ctx = { phase, week: w, wInPhase: phaseCount[phase] - 1, vf, prog: weeks > 1 ? w / (weeks - 1) : 1, deload };
    const ws = addDays(start, w * 7);
    let types = [...tpl];
    if (phase === 'taper' && w === weeks - 1) types = types.filter(t => !['strB', 'cond', 'long', 'quality2'].includes(t));
    const map = assignDays(types, days, P.longDay ?? 6);
    for (const [d, t] of map) {
      const date = addDays(ws, d);
      if (date < from || date > end || (hasRace && date >= P.raceDate)) continue;
      const s = ({ hybrid: () => hybridSession(P, ctx), quality: () => qualityRun(P, ctx, 0), quality2: () => qualityRun(P, ctx, 1), strA: () => strength(P, ctx, 'A'), strB: () => strength(P, ctx, 'B'), long: () => longRun(P, ctx), easy: () => easyRun(P, ctx), cond: () => conditioning(P, ctx) })[t]();
      if (deload) s.notes = 'Semana de descarga: termina con sensación de poder hacer más. ' + (s.notes || '');
      out.push(finish(s, P, { date, phase, week: w + 1 }));
    }
    if (P.mobility) { const d = [0, 1, 2, 3, 4, 5, 6].find(x => !days.includes(x)); const date = d != null ? addDays(ws, d) : null; if (date && date >= from && date <= end && (!hasRace || date < P.raceDate)) out.push(finish(mobility(), P, { date, phase, week: w + 1 })); }
  }
  if (hasRace && P.raceDate >= from) out.push(finish(raceDay(P), P, { date: P.raceDate, phase: 'taper', week: weeks }));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function finish(s, P, extra = {}) {
  const o = { id: uid(), time: P.time || '', optional: false, source: 'auto', ...s, ...extra, updatedAt: Date.now() };
  const m = measure(o, P);
  if (!o.duration) o.duration = o.kind === 'race' && P.goal === 'hyrox' ? 90 : Math.max(15, m.min + (o.kind === 'strength' ? 5 : 0));
  if (o.distance == null && m.km) o.distance = m.km;
  return o;
}

// normaliza una sesión llegada de la IA o de una importación
export function normalize(s, P) {
  const o = { ...s };
  if (!KIND[o.kind]) o.kind = 'run';
  if (!Array.isArray(o.blocks)) o.blocks = [];
  o.blocks = o.blocks.map(b => ({ title: String(b.title || ''), type: ['run', 'exercises', 'text'].includes(b.type) ? b.type : 'text', rounds: +b.rounds || 1, steps: (b.steps || []).map(x => ({ dur: +x.dur > 0 ? +x.dur : undefined, dist: +x.dist > 0 ? +x.dist : undefined, zone: x.zone === 'race' ? `race:${+P.raceKm || 5}` : x.zone || 'easy', label: x.label || '' })).filter(x => x.dur || x.dist), items: (b.items || []).map(x => ({ name: String(x.name || ''), sets: +x.sets || 1, reps: String(x.reps ?? ''), rest: +x.rest || 0, load: x.load || '', note: x.note || '' })), text: b.text || '' }));
  o.id = o.id || uid(); o.title = String(o.title || KIND[o.kind].name);
  o.duration = +o.duration || measure(o, P).min || 30;
  o.distance = +o.distance > 0 ? Math.round(+o.distance * 10) / 10 : (measure(o, P).km || null);
  o.optional = !!o.optional; o.notes = String(o.notes || ''); o.focus = String(o.focus || '');
  o.intensity = ['easy', 'moderate', 'hard'].includes(o.intensity) ? o.intensity : 'moderate';
  o.updatedAt = Date.now();
  return o;
}

export const weekOfPlan = (P, date) => Math.floor(diffDays(monday(date), planWeeks(P).start) / 7) + 1;
export const isRaceS = s => s && s.kind === 'race';
export { weekday, dt };
