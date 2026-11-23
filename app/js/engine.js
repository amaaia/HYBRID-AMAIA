// Generador de planes local (sin IA) y formato de sesión de toda la app.
// Método de entrenamiento: sesiones con estructura fija (calentamiento 15″/15″ o AMRAP, movilidad, fuerza con RIR,
// core, conditioning/metcon, vuelta a la calma y respiración), carrera por «ritmo 5K +X s», fartleks y cuestas
// progresivos, cardio largo combinando ergómetros y carrera, específicos de competición híbrida (trineos,
// carrera + burpee broad jump / wall balls, E2MOM/E3MOM) y una puesta a punto de activación sin fatiga.
// Todo se adapta al material disponible, al nivel y al tiempo por sesión.
import { addDays, monday, iso, dt, diffDays, uid, weekday, clamp } from './util.js';
import { kmForSeconds } from './paces.js';

/* ---------- formato de sesión ----------
session = {
  id, date, time, kind:'run'|'strength'|'hybrid'|'conditioning'|'mobility'|'race',
  title, focus, duration (min), distance (km), intensity:'easy'|'moderate'|'hard', optional, phase, week, notes,
  blocks:[{ title, type:'run'|'exercises'|'text', rounds, min?, steps:[{dur?:seg, dist?:km, zone, label?}],
            items:[{name, sets, reps, rest, load, note, est?}], text }],
  source:'auto'|'ai'|'user', updatedAt
}
Zonas de carrera: 'p5+N' (ritmo 5K + N s/km), 'easy', 'recovery', 'hill', 'race:KM', etc. (ver paces.js) */

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
export const PHASE = { base: 'Base', build: 'Desarrollo', peak: 'Específico', taper: 'Puesta a punto' };

/* ---------- material: nombre del ejercicio según lo que tiene la persona ---------- */
const EX = {
  deadlift: ['Peso muerto con barra', 'Peso muerto rumano con mancuernas', 'Puente de glúteo a una pierna'],
  sumo: ['Peso muerto sumo', 'Peso muerto sumo con kettlebell', 'Sentadilla sumo con pausa'],
  hipthrust: ['Hip thrust con barra', 'Hip thrust con mancuerna', 'Hip thrust a una pierna'],
  dbrow: ['Remo con mancuerna a una mano', 'Remo con mancuerna a una mano', 'Remo invertido bajo una mesa'],
  pullup: ['Dominadas estrictas (con goma si hace falta)', 'Remo inclinado con mancuernas', 'Remo con toalla en una puerta'],
  backext: ['Extensión lumbar en banco (GHD)', 'Buenos días con mancuerna', 'Superman'],
  frontsquat: ['Sentadilla frontal con barra', 'Sentadilla frontal con mancuernas', 'Sentadilla con pausa de 2 s'],
  backsquat: ['Sentadilla trasera con barra', 'Sentadilla goblet', 'Sentadilla con pausa de 2 s'],
  cyclist: ['Sentadilla goblet con talones elevados', 'Sentadilla goblet con talones elevados', 'Sentadilla con talones elevados'],
  bench: ['Press de banca', 'Press con mancuernas en banco o suelo', 'Flexiones'],
  floorpress: ['Press en suelo con mancuernas', 'Press en suelo con mancuernas', 'Flexiones con pausa abajo'],
  dbpress: ['Press de hombros con mancuernas sentado', 'Press de hombros con mancuernas', 'Flexiones en pica'],
  thruster: ['Thruster con barra', 'Thruster con mancuernas', 'Sentadilla + press con mochila'],
  lungeFR: ['Zancada con kettlebells en rack', 'Zancada con mancuernas en los hombros', 'Zancada atrás alterna'],
  suitcase: ['Zancada atrás con kettlebell en una mano', 'Zancada atrás con mancuerna en una mano', 'Zancada atrás con mochila'],
  ohLunge: ['Zancada caminando con mancuerna por encima de la cabeza', 'Zancada caminando con mancuerna por encima de la cabeza', 'Zancada caminando con brazos arriba'],
  walkLunge: ['Zancadas caminando con mancuernas', 'Zancadas caminando con mancuernas', 'Zancadas caminando'],
  slrdl: ['Peso muerto a una pierna con mancuerna', 'Peso muerto a una pierna con mancuerna', 'Peso muerto a una pierna sin peso'],
  bulgarian: ['Sentadilla búlgara con mancuernas', 'Sentadilla búlgara con mancuernas', 'Sentadilla búlgara'],
  landmine: ['Press landmine a una mano', 'Press de hombro a una mano con mancuerna', 'Flexiones con manos elevadas'],
  cluster: ['Cluster con mancuernas (clean + thruster)', 'Cluster con mancuernas (clean + thruster)', 'Sentadilla con salto + flexión'],
  powerclean: ['Power clean con mancuernas', 'Power clean con mancuernas', 'Saltos verticales con brazos'],
  snatch: ['Snatch con mancuerna a una mano', 'Snatch con mancuerna a una mano', 'Burpee con salto vertical'],
  pushpress: ['Push press con mancuernas', 'Push press con mancuernas', 'Flexiones explosivas'],
  farmer: ['Paseo del granjero', 'Paseo del granjero con mancuernas', 'Paseo con mochila o garrafas'],
  rackcarry: ['Paseo con kettlebells en rack', 'Paseo con mancuernas en los hombros', 'Paseo con mochila al pecho'],
  stepup: ['Step-up al cajón con mancuernas', 'Step-up con mancuernas', 'Step-up a una silla firme'],
  swing: ['Swing con kettlebell', 'Swing con mancuerna', 'Puente de glúteo explosivo'],
  wallball: ['Wall balls (balón a la pared)', 'Thrusters con mancuernas ligeras', 'Sentadilla + lanzamiento sin balón'],
  slam: ['Slam ball', 'Swing con mancuerna', 'Burpees'],
  boxburpee: ['Burpee + step-up al cajón', 'Burpee + step-up a una silla', 'Burpee + step-up a una silla'],
  bbj: ['Burpee con salto de longitud', 'Burpee con salto de longitud', 'Burpee con salto de longitud'],
  ringrow: ['Remo en anillas o TRX', 'Remo con banda elástica', 'Remo invertido bajo una mesa'],
  facepull: ['Face pull con banda', 'Face pull con banda', 'Y-T-W tumbada boca abajo'],
};
const EQI = { gym: 0, basic: 1, none: 2 };
let CUR = null; // perfil activo mientras se genera
const X = k => EX[k][EQI[CUR?.equipment] ?? 1];
const hasErg = () => CUR?.equipment === 'gym';
const hasSki = () => !!CUR?.sledAccess;
const hasSled = () => !!CUR?.sledAccess;
// ergómetros: si no hay, sustituto de duración parecida
function erg(kind, amount) {
  const m = String(amount).match(/^([\d.]+)\s*(cal|m|min|s)$/), n = m ? +m[1] : 0, u = m ? m[2] : '';
  const secs = u === 'cal' ? n * 4 : u === 'm' ? n / 1000 * 270 : u === 'min' ? n * 60 : n;
  const T = s => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s / 5) * 5} s`);
  if (kind === 'ski') return hasSki() ? ['SkiErg', amount] : hasErg() ? ['Remo ergómetro', amount] : CUR?.equipment === 'basic' ? ['Tirones con banda elástica (simulación ski)', T(secs)] : ['Jumping jacks + burpees sin salto', T(secs)];
  if (kind === 'row') return hasErg() ? ['Remo ergómetro', amount] : CUR?.equipment === 'basic' ? ['Swing con mancuerna + burpees alternos', T(secs)] : ['Burpees a ritmo constante', T(secs)];
  return hasErg() ? ['Bici (BikeErg o assault)', amount] : ['Skipping en el sitio o comba', T(secs)];
}
const EI = (kind, amount, rest = 0, note = '', est) => { const [n, q] = erg(kind, amount); return it(n, 1, q, rest, note, est); };
const sledPush = () => (hasSled() ? 'Empuje de trineo' : 'Sprint en cuesta (sustituye al empuje de trineo)');
const sledPull = () => (hasSled() ? 'Arrastre de trineo' : CUR?.equipment === 'gym' ? 'Remo en polea pesado (sustituye al arrastre de trineo)' : 'Remo con mancuerna pesado (sustituye al arrastre de trineo)');

/* ---------- piezas ---------- */
const it = (name, sets, reps, rest = 0, note = '', est) => ({ name, sets, reps: String(reps), rest, load: '', note, ...(est ? { est } : {}) });
const E = (k, sets, reps, rest = 90, note = '') => it(X(k), sets, reps, rest, note);
const ex = (title, items, rounds = 1, min) => ({ title, type: 'exercises', rounds, items, ...(min ? { min } : {}) });
const txt = (title, lines, min) => ({ title, type: 'text', text: Array.isArray(lines) ? lines.map(l => '• ' + l).join('\n') : lines, min });
const runB = (title, steps, rounds = 1) => ({ title, type: 'run', rounds, steps });
const r = (min, zone, label = '') => ({ dur: Math.round(min * 60), zone, label });
const rk = (km, zone, label = '') => ({ dist: km, zone, label });

const WU_1515 = () => txt('Calentamiento · 4 min (15″ / 15″)', [`Alterna 15 s de trabajo y 15 s de descanso durante 4 min en ${hasErg() ? 'bici, remo, carrera o ski' : 'carrera suave, skipping o jumping jacks'}.`], 4);
const MOB = {
  hips: ['Balanceos de pierna → 10/10', 'Puente de glúteo → 20', 'Estiramiento de flexor de cadera → 45/45 s', 'Estiramiento de isquios con banda → 30/30 s'],
  thor: ['Gato-camello → 30 s', 'Rotación torácica en cuadrupedia → 10/10', 'Separación de banda (band pull apart) → 20', 'Círculos de muñeca → 30 s'],
  full: ['Jefferson curl ligero → 10', 'Postura de rana → 30 s', 'Pase de hombros con palo o banda → 10', 'Balanceo de aductores (adductor rock backs) → 10/10'],
  post: ['Jefferson curl ligero → 10', 'Círculos de cadera (hip CARs) → 10', 'Sentadilla profunda mantenida → 30 s', 'Estiramiento de sofá (couch stretch) → 30/30 s'],
  run: ['Puente de glúteo con alcance → 10', 'Balanceos de pierna → 10/10', 'Zancada con rotación → 5/5', 'Abridores de cadera dinámicos → 5/5'],
};
const MOBB = (k, min) => txt(`Movilidad · ${min} min AMRAP`, [...MOB[k], 'Repite el circuito sin prisa hasta completar el tiempo.'], min);
const BREATH = () => txt('Respiración · 5 min', ['Respiración en caja: 4 s inspirar, 4 s retener, 4 s espirar, 4 s retener.'], 5);
const COOL = (min = 8) => txt('Vuelta a la calma', [`${hasErg() ? 'Bici' : 'Paseo o trote'} ${min} min muy suave (zona 2 baja).`], min);
const CORE = (rounds, kind = 0) => {
  const sets = [
    [it('V-ups', 1, 15), it('Hollow hold', 1, '30 s'), it('Russian twist', 1, '20/20')],
    [it('Plancha lateral', 1, '30/30 s'), it('Dead bug', 1, '5/5 lentos'), it('Pallof press de pie', 1, '8/8')],
    [it('Hollow hold', 1, '40 s'), it('Bird dog', 1, '10/10'), it('Puente de glúteo', 1, 20)],
    [it('Russian twist', 1, '20/20'), it('Plancha con toque de hombro', 1, 30), it('Pallof press', 1, '10/10')],
  ][kind % 4];
  return ex(`Core · ${rounds} rondas`, sets, rounds, rounds * 3);
};
// fuerza principal: rampa por RIR en base, series fijas en desarrollo, mantenimiento en específico
function mainLift(k, ctx, P) {
  const beg = P.level === 'beginner';
  if (ctx.phase === 'taper') return E(k, 3, 8, 120, 'Ligero: termina con 4-5 repeticiones de margen');
  if (ctx.phase === 'base' && !beg) return E(k, 5, '5 + serie final 3-6', 150, 'Antes, 3-4 series de aproximación. Luego 5 reps dejando 4, 3, 2 y 1 de margen (RIR 4→1) y una última de 3-6 reps. Descanso 2-3 min.');
  if (ctx.phase === 'peak') return E(k, 4, 8, 120, 'RIR 4-5: fuerza de mantenimiento, sin fatiga');
  return E(k, 4, beg ? 8 : 6, 120, beg ? 'RIR 3: técnica antes que peso' : 'RIR 2-3 (~70 % de tu máximo). Aproximación previa.');
}
const level = (P, a, b, c) => (P.level === 'beginner' ? a : P.level === 'advanced' ? c : b);
const scale = (P, ctx, n) => Math.max(1, Math.round(n * (P.sessionMin || 60) / 60 * (ctx.deload ? 0.75 : 1)));

/* ---------- FUERZA ---------- */
function strPost(P, ctx) {
  const v = (ctx.week + (ctx.phase === 'build' ? 1 : 0)) % 3, rnd = scale(P, ctx, level(P, 3, 4, 5));
  const strength = ex('Fuerza · cadena posterior', [
    mainLift(v === 2 ? 'sumo' : 'deadlift', ctx, P),
    E('hipthrust', 4, ctx.phase === 'base' ? 10 : 12, 90, 'Pesado, pausa de 2 s arriba'),
    E('dbrow', 3, '8/8', 75),
    v === 1 ? E('farmer', 3, '50 m', 90, 'Pesado') : E('pullup', 4, 8, 90, 'Avanzado: con lastre · empezando: con goma'),
    E('backext', 3, 15, 60),
  ], 1, 32);
  const [bi, bq] = erg('bike', '18 cal'), [ri, rq] = erg('row', '500 m'), [si, sq] = erg('ski', '400 m'), [ro, rc] = erg('row', `${level(P, 20, 30, 40)} cal`);
  const cond = [
    ex(`WOD · por tiempo`, [it(ro, 1, rc), it(X('boxburpee'), 1, 10), it('Burpees', 1, level(P, 12, 20, 25)), EI('row', `${level(P, 10, 20, 30)} cal`), it(X('boxburpee'), 1, 10), it('Burpees', 1, level(P, 8, 15, 20))], 1, level(P, 12, 16, 20)),
    ex(`Conditioning · ${rnd} rondas (descanso 2 min)`, [it(si, 1, sq), it(X('swing'), 1, 12), it('Sit-ups', 1, 20)], rnd, rnd * 5),
    ex(`Conditioning · ${rnd} rondas (descanso 2 min)`, [it(bi, 1, bq), it(ri, 1, rq, 0, 'Ritmo 2K +10-12 s/500 m'), it(`${X('slam')} — transporte`, 1, '30 m')], rnd, rnd * 6),
  ][v];
  return { kind: 'strength', title: 'Fuerza cadena posterior + conditioning', focus: 'Peso muerto, cadera y espalda', intensity: 'hard',
    blocks: [WU_1515(), MOBB('post', P.sessionMin <= 45 ? 5 : 10), strength, cond, COOL(6)],
    notes: 'En la fuerza, deja siempre las repeticiones de margen indicadas (RIR): sin llegar al fallo.' };
}
function strFull(P, ctx) {
  const v = ctx.week % 4, rnd = scale(P, ctx, level(P, 3, 4, 5));
  const runner = P.goal === 'race';
  if (runner || v === 2) { // unilateral
    const [b, bq] = erg('bike', `${level(P, 12, 16, 20)} cal`);
    return { kind: 'strength', title: runner ? 'Fuerza unilateral + core' : 'Fuerza unilateral + conditioning', focus: 'Estabilidad y fuerza de una pierna', intensity: runner ? 'moderate' : 'hard',
      blocks: [txt('Calentamiento · 5 min AMRAP', [`${hasErg() ? 'Bici' : 'Trote suave'} 30 s`, 'Plancha 20 s', 'Superman 20 s', 'Sentadillas 12'], 5), MOBB('full', P.sessionMin <= 45 ? 5 : 8),
        ex('Fuerza unilateral', [E('slrdl', 4, '10/10', 75), E('suitcase', 4, '10/10', 75), E('ohLunge', 3, '8/8', 75), E('landmine', 4, '8/8', 60)], 1, 26),
        runner ? CORE(3, ctx.week) : ex(`Conditioning · ${Math.min(3, rnd)} rondas por tiempo (descanso 3 min)`, [it(b, 1, bq), it('Sentadillas', 1, level(P, 30, 40, 50)), it(X('walkLunge'), 1, '30 m'), it('Burpees', 1, level(P, 10, 15, 20))], Math.min(3, rnd), Math.min(3, rnd) * 7),
        COOL(6)],
      notes: runner ? 'Fuerza de corredor: cada pierna por separado para prevenir lesiones y ganar economía.' : 'Controla la bajada en cada repetición.' };
  }
  if (v === 0) { // empuje + metcon
    const [b, bq] = erg('bike', '15 cal');
    return { kind: 'strength', title: 'Fuerza empuje + metcon', focus: 'Sentadilla y empuje', intensity: 'hard',
      blocks: [WU_1515(), MOBB('thor', P.sessionMin <= 45 ? 5 : 10),
        ex('Fuerza', [mainLift('frontsquat', ctx, P), E('cyclist', 4, 12, 60), E('bench', 4, 8, 90, 'RIR 2-3'), E('dbpress', 4, 10, 75)], 1, 28),
        ex(`Metcon · ${Math.min(6, rnd + 1)} rondas (descanso 90 s)`, [it(b, 1, bq, 0, 'De pie, fuerte'), it('Sentadillas', 1, 10), it('Saltos verticales', 1, 5)], Math.min(6, rnd + 1), (rnd + 1) * 3), COOL(5)],
      notes: 'El metcon es rápido pero controlado: misma calidad en la última ronda que en la primera.' };
  }
  if (v === 1) { // full body en circuito
    const [rw, rq] = hasErg() ? ['Remo ergómetro', '3 km'] : ['Carrera suave', '20 min'];
    return { kind: 'strength', title: 'Full body + core', focus: 'Fuerza general en circuito', intensity: 'moderate',
      blocks: [txt('Calentamiento · 4 min (15″ / 15″)', [hasErg() ? 'Remo' : 'Jumping jacks', 'Peso muerto rumano ligero', 'Flexiones'], 4),
        ex(`Circuito de fuerza · ${rnd} rondas (descanso 90 s)`, [E('backsquat', 1, 6, 0, '≈65 % de tu máximo'), E('lungeFR', 1, '5+5', 0), E('bench', 1, 8, 0), E('dbrow', 1, '5+5', 0), it('Sentadillas', 1, 20), it('Flexiones', 1, 15), it('Zancadas con salto', 1, '6/6'), it('Hollow hold', 1, '30 s', 90)], rnd, rnd * 7),
        CORE(3, 1), txt('Resistencia', [`${rw} → ${rq} suave (zona 2${hasErg() ? ', 20-22 paladas/min' : ''})`], hasErg() ? 15 : 20)],
      notes: 'Circuito continuo: pasa de un ejercicio al siguiente sin descanso y descansa al final de la ronda.' };
  }
  // específica (dumbbells + EMOM)
  const [ab, abq] = erg('bike', 'máx. cal en 1 min');
  return { kind: 'strength', title: 'Fuerza específica + EMOM', focus: 'Potencia con mancuernas', intensity: 'hard',
    blocks: [txt('Calentamiento · 5 min AMRAP', [`${hasErg() ? 'Bici 15 cal' : 'Skipping 1 min'}`, 'Inchworm → 8', 'Monster walks → 8+8', 'World’s greatest stretch → 2+2'], 5), MOBB('full', 7),
      ex('Fuerza', [E('cluster', 4, 8, 90, 'RIR 3-4'), E('powerclean', 4, 8, 90, 'RIR 3-4'), E('snatch', 4, '10/10', 75), E('lungeFR', 4, '8/8', 75)], 1, 24),
      ex('EMOM 20 min · 4 bloques (descanso 1 min)', [E('frontsquat', 1, 8, 0, 'Con margen'), it(X('slam'), 1, 8), E('lungeFR', 1, '6+6', 0), it(hasErg() ? 'Bici — máximas calorías' : 'Burpees — máximas reps', 1, '1 min', 60)], 4, 20), COOL(6)],
    notes: 'Objetivo del EMOM: sumar el máximo de calorías (o repeticiones) en las 4 rondas manteniendo la técnica.' };
}
function circuitDB(P, ctx) {
  const rnd = clamp(scale(P, ctx, level(P, 2, 3, 4)), 2, 4);
  const st = [X('floorpress'), X('snatch'), X('thruster'), X('powerclean'), X('stepup'), X('lungeFR'), X('pushpress'), X('walkLunge'), 'Burpees con mancuernas'];
  const end = hasErg() ? 'Remo ergómetro 5 × 3 min a 20 paladas/min (75-80 % de tu ritmo 2K), descanso 90 s' : 'Carrera 5 × 3 min a ritmo 5K +45 s, 90 s de descanso andando';
  return { kind: 'conditioning', title: 'Circuito de fuerza-resistencia', focus: '9 estaciones de 1 min', intensity: 'hard',
    blocks: [txt('Movilidad · 10 min AMRAP', ['Inchworm → 5', 'Twisted cross → 15 s', 'Monster walks → 10+10', 'Superman con alcance → 10', 'Flexiones → 12-15', 'Dominadas o remo → 4-8'], 8),
      ex(`Circuito · ${rnd} rondas · 1 min trabajo / 30 s descanso`, st.map(n => it(n, 1, '1 min', 30, '', 90)), rnd, rnd * 14 + (rnd - 1) * 3),
      txt('Resistencia', [end], 22)],
    notes: 'Descansa 3 min entre rondas. Elige un peso que puedas mover el minuto entero con buena técnica.' };
}

/* ---------- CARRERA ---------- */
const RUN_WU = () => runB('Calentamiento', [r(10, 'easy', 'progresivo')]);
const RUN_CD = (m = 10) => runB('Vuelta a la calma', [r(m, 'recovery', 'trote o andando')]);
const ACC = (n, sec = 45) => runB(`Aceleraciones · ${n}`, [r(sec / 60, 'rep', 'aceleración'), r(1, 'recovery', 'descanso')], n);
function fartlek(P, ctx) {
  const beg = P.level === 'beginner', up = Math.min(2, Math.floor(ctx.wInPhase / 4)), fit = m => clamp(Math.round((m + up) * (P.sessionMin || 60) / 60), 2, 8);
  const lib = {
    soft: () => ({ t: 'Fartlek suave', b: [runB('Fartlek · 20 min', [r(1, 'p5+60'), r(2, 'easy', 'suave')], fit(7)), ACC(3, 30)] }),
    f1: () => ({ t: 'Fartlek escalera', b: [runB(`Fartlek · bloques de 5 min`, [r(2, 'p5+80'), r(2, 'p5+30'), r(1, 'p5+10')], fit(beg ? 4 : 6))] }),
    f2: () => ({ t: 'Fartlek + aceleraciones', b: [runB('Fartlek · bloques de 5 min', [r(1.5, 'p5+80'), r(2, 'p5+30'), r(1.5, 'p5+10')], fit(5)), ACC(5)] }),
    f3: () => ({ t: 'Fartlek con final a ritmo 5K', b: [runB('Fartlek · bloques de 5 min', [r(1, 'p5+90'), r(2, 'p5+30'), r(2, 'p5+10')], fit(4)), ACC(3, 60), runB('Bloque final', [r(4, 'p5+0')])] }),
    f4: () => ({ t: 'Fartlek 90-60-30', b: [runB('Bloque 1 · cada 3 min', [r(1.5, 'p5+90'), r(1, 'p5+15'), r(0.5, 'p5+0')], fit(5)), runB('Pausa', [r(4, 'recovery', 'andando o trote muy suave')]), runB('Bloque 2 · cada 3 min', [r(1.5, 'p5+90'), r(1, 'p5+15'), r(0.5, 'p5+0')], fit(5)), ACC(4)] }),
    f5: () => ({ t: 'Fartlek de control aeróbico', b: [runB('Fartlek continuo · 30 min', [r(1, 'p5+90'), r(1, 'p5+15')], fit(15)), runB('2 × 400 m rápidos', [rk(0.4, 'rep'), r(1, 'recovery', 'descanso')], 2)], n: 'Respiración nasal en los tramos suaves. Controla el ritmo en los rápidos: no buscas el fallo.' }),
    prog: () => ({ t: 'Carrera progresiva', b: [runB('Progresivo', [r(10, 'p5+60'), r(7, 'p5+45'), r(5, 'p5+30'), r(3, 'p5+20')])] }),
    ints: () => ({ t: 'Intervalos 7 min + 2 min', b: [runB('2 × 7 min (descanso 3 min)', [r(7, 'p5+20'), r(3, 'recovery', 'descanso')], 2), runB('3 × 2 min (descanso 90 s)', [r(2, 'p5+0'), r(1.5, 'recovery', 'descanso')], 3)] }),
  };
  const order = { base: beg ? ['soft', 'f1', 'soft', 'f5', 'f1', 'prog'] : ['f1', 'f2', 'prog', 'f5', 'f2', 'f1'], build: ['f2', 'f3', 'prog', 'f4', 'f3', 'ints'], peak: ['f4', 'ints', 'f5', 'f3'], taper: ['soft'] }[ctx.phase] || ['f1'];
  const pick = lib[order[ctx.wInPhase % order.length]]();
  return { kind: 'run', title: pick.t, focus: 'Cambios de ritmo', intensity: 'hard', blocks: [RUN_WU(), txt('Movilidad', MOB.run, 3), ...pick.b, RUN_CD(10)],
    notes: pick.n || 'Los ritmos «+X» son segundos por km más lentos que tu ritmo de 5K. El último bloque igual que el primero.' };
}
function hills(P, ctx) {
  const lib = [
    () => ({ t: 'Cuestas cortas + ritmo', b: [runB('Activación', [r(1, 'p5+10', 'aceleración'), r(1, 'easy', 'trote')], 4), runB('Cuestas · 7 × 200 m (bajar andando, 1 min)', [r(1, 'hill', 'cuesta 6-8 %'), r(1, 'recovery', 'bajar')], 7), runB('Bloque de ritmo · 2 × 6 min (descanso 3 min)', [r(6, 'p5+10'), r(3, 'recovery', 'descanso')], 2)] }),
    () => ({ t: 'Cuestas + saltos', b: [runB('Activación', [r(1, 'p5+10', 'aceleración'), r(1, 'easy', 'trote')], 4), runB('3 bloques · 1 min de cuesta + 6 sentadillas con salto', [r(1, 'hill', 'cuesta + 6 saltos'), r(1, 'recovery', 'bajar'), r(1, 'hill', 'cuesta + 6 saltos'), r(1, 'recovery', 'bajar'), r(1.5, 'recovery', 'descanso')], 3), runB('Bloque final', [r(5, 'p5+10')])] }),
    () => ({ t: 'Cuestas con pliometría', b: [runB('Activación', [r(1, 'p5+10', 'aceleración'), r(1, 'easy', 'trote')], 4), runB('5 series · 6+6 zancadas con salto, 8 saltos y 45 s de cuesta', [r(0.75, 'hill', 'tras los saltos'), r(1.75, 'recovery', 'descanso')], 5), runB('Bloque final', [r(8, 'p5+12'), r(3, 'recovery', 'descanso'), r(5, 'p5+15')])] }),
    () => ({ t: 'Cuesta + llano a ritmo 5K', b: [runB('Activación · skipping y sprint estático', [r(0.5, 'rep', 'skipping'), r(1, 'easy', 'trote')], 4), runB('8 series · 1 min de cuesta, bajar, 1 min a ritmo 5K', [r(1, 'hill', 'cuesta'), r(1, 'recovery', 'bajar'), r(1, 'p5+0', 'llano')], 8), runB('Final', [r(4, 'recovery', 'descanso'), r(8, 'p5+20')])] }),
    () => ({ t: 'Cuestas específicas', b: [runB('Activación · 15 sentadillas + 30 s de aceleración', [r(0.5, 'p5+0', 'aceleración'), r(1, 'easy', 'trote')], 4), runB('4 rondas · cuesta + 2 min a ritmo 5K', [r(1, 'hill', 'cuesta'), r(1, 'recovery', 'bajar'), r(2, 'p5+0', 'llano'), r(2, 'recovery', 'descanso')], 4), runB('Final', [r(10, 'p5+25')])] }),
  ];
  const i = { base: 0, build: 1 + (ctx.wInPhase % 2), peak: 3 + (ctx.wInPhase % 2), taper: 0 }[ctx.phase] ?? 0;
  const pick = lib[i]();
  return { kind: 'run', title: pick.t, focus: 'Fuerza en carrera', intensity: 'hard', blocks: [RUN_WU(), ...pick.b, RUN_CD(10)],
    notes: 'Cuesta del 6-8 %. En cinta, pon esa inclinación. En la subida cuenta el esfuerzo, no el ritmo.' };
}
function z2Core(P, ctx) {
  const run = clamp(Math.round((P.sessionMin || 60) * 0.6 / 5) * 5, 20, 45);
  const split = P.level === 'beginner' || ctx.phase === 'base';
  return { kind: 'run', title: 'Regenerativo + core', focus: 'Zona 2 y recuperación', intensity: 'easy',
    blocks: [split ? runB('Carrera zona 2', [r(Math.round(run / 2), 'p5+90'), r(5, 'recovery', 'andando'), r(Math.round(run / 2), 'p5+90')]) : runB('Carrera zona 2', [r(run, 'p5+80', 'terreno llano o cinta')]),
      CORE(level(P, 3, 4, 5), 2), MOBB('hips', 8), BREATH()],
    notes: 'Muy cómodo: debes poder hablar en frases completas. Si respiras por la nariz, vas bien.' };
}
function z2Run(P, ctx) {
  const run = clamp(Math.round((P.sessionMin || 60) * 0.75 / 5) * 5, 25, 50);
  return { kind: 'run', title: 'Carrera zona 2', focus: 'Base aeróbica', intensity: 'easy',
    blocks: [runB('Carrera zona 2', [r(run, 'p5+80', 'terreno llano o cinta')]), CORE(level(P, 3, 4, 5), 2)],
    notes: 'Ritmo cómodo y constante. Respiración nasal si puedes.' };
}
function longCardio(P, ctx) {
  const km = +P.raceKm || 10, f = (P.sessionMin || 60) / 60;
  if (P.goal === 'race' || !hasErg()) {
    const cap = P.goal === 'race' ? (km >= 42 ? 150 : km >= 21 ? 110 : km >= 10 ? 75 : 55) : 75;
    const base = P.goal === 'race' ? (km >= 42 ? 70 : km >= 21 ? 55 : 45) : 45;
    const tot = clamp(Math.round((base + (cap - base) * ctx.prog) * (ctx.deload ? 0.75 : 1) / 5) * 5, 30, cap);
    const steps = ctx.phase === 'base' ? [r(tot - 10, 'p5+70', 'continuo, RPE 5-6'), r(10, 'recovery', 'muy suave')]
      : P.goal === 'race' && km >= 21 && ctx.phase === 'peak' ? [r(tot - 35, 'p5+70'), r(25, `race:${km}`, 'ritmo objetivo'), r(10, 'recovery', 'muy suave')]
        : [r(tot - 20, 'p5+70', 'continuo, RPE 5-6'), r(10, 'p5+45', 'progresivo hasta +30'), r(10, 'recovery', 'muy suave')];
    return { kind: 'run', title: 'Base aeróbica · tirada larga', focus: 'Volumen aeróbico', intensity: 'moderate',
      blocks: [txt('Calentamiento', MOB.run, 5), runB('Carrera', steps), txt('Recuperación', ['Trote o paseo 5-10 min', 'Rodillo de espuma en piernas 5 min'], 8)],
      notes: 'Ritmo constante y sin acumular fatiga. Lleva agua si pasa de 75 min.' };
  }
  const v = (ctx.week + (ctx.phase === 'build' ? 1 : ctx.phase === 'peak' ? 2 : 0)) % 4, n = clamp(Math.round(4 * f), 2, 5);
  const lib = [
    () => ({ t: 'Cardio largo · ski + remo + carrera', b: [ex('Ergómetros (descanso 2 min entre tramos)', [EI('ski', '2000 m', 0, 'Ritmo 2K +12-15 s/500 m'), EI('row', '2000 m', 0, 'Ritmo 2K +12-15 s/500 m'), EI('ski', '1000 m', 0, 'Ritmo 2K +5 s'), EI('row', '1000 m', 0, 'Ritmo 2K +5 s')].map(x => ({ ...x, rest: 120, est: 300 })), 1, 30), runB('Carrera', [rk(clamp(Math.round(5 * f), 3, 6), 'p5+60')])] }),
    () => ({ t: 'Cardio largo + autocargas', b: [ex('Ski · 4 × 750 m (descanso 90 s)', [EI('ski', '750 m', 90, 'Ritmo 2K +5-7 s', 230)], n, n * 4), runB('Carrera', [rk(3, 'p5+60'), r(4, 'recovery', 'descanso')]), ex('Remo · 4 × 750 m (descanso 90 s)', [EI('row', '750 m', 90, 'Ritmo 2K +5-7 s', 230)], n, n * 4), runB('Carrera', [rk(3, 'p5+60')]), ex('Finisher', [it(X('walkLunge'), 1, '100 m'), it('Sentadillas', 1, 50), it('Burpees', 1, level(P, 25, 40, 50)), it('Flexiones con despegue de manos', 1, 20)], 1, 10)] }),
    () => ({ t: 'Cardio largo · ergs + carrera', b: [ex('Ski', [EI('ski', '2000 m', 0, 'Ritmo 2K +15 s', 540)], 1, 9), runB('Carrera', [rk(1.5, 'p5+60'), r(4, 'recovery', 'descanso')]), ex('Remo', [EI('row', '2000 m', 0, 'Ritmo 2K +12-15 s', 540)], 1, 9), runB('Carrera', [rk(1.5, 'p5+60'), r(4, 'recovery', 'descanso')]), ex('Bici', [EI('bike', '15 min', 0, '75-80 % de tu FTP', 900)], 1, 15), ex('Finisher', [it('Sentadillas', 1, 100), it(X('walkLunge'), 1, '100 m')], 1, 8)] }),
    () => ({ t: 'Transiciones erg + carrera', b: [runB(`Bloque 1 · ${n} rondas de ski 3 min + carrera 2 min`, [r(3, 'recovery', 'ski 3 min (arriba)'), r(2, 'p5+60')], n), runB('Descanso', [r(5, 'recovery', 'andando')]), runB(`Bloque 2 · ${n} rondas de bici 3 min + carrera 2 min`, [r(3, 'recovery', `${hasErg() ? 'bici' : 'skipping'} 3 min al 80-85 % FTP`), r(2, 'p5+60')], n)], n: 'Objetivo: control del ritmo, volumen aeróbico y transiciones rápidas entre máquina y carrera.' }),
  ];
  const pick = lib[v]();
  return { kind: 'conditioning', title: pick.t, focus: 'Volumen aeróbico en varias máquinas', intensity: 'moderate',
    blocks: [txt('Calentamiento · 10 min AMRAP', [`${hasErg() ? 'Remo' : 'Trote'} 5 min`, 'Balanceos de pierna → 10/10', 'Postura de rana → 30 s', 'Círculos de brazos → 20', 'Band pull apart → 20', 'Zancada atrás → 5/5', 'Rotación torácica → 10/10'], 10), ...pick.b, BREATH()],
    notes: pick.n || 'Ritmo constante en todo el bloque. Los «ritmo 2K +X» se refieren a tu ritmo de 2000 m en la máquina.' };
}

/* ---------- ESPECÍFICOS DE COMPETICIÓN HÍBRIDA ---------- */
function hyroxSpec(P, ctx) {
  const v = ctx.phase === 'base' ? ctx.wInPhase % 2 : 2 + (ctx.wInPhase % 3);
  const up = 10 * Math.min(2, Math.floor(ctx.wInPhase / 2)), bbj = level(P, 20, 30, 40) + up, wb = level(P, 20, 30, 40) + up;
  const lib = [
    () => ({ t: 'Carrera + burpee broad jump / carrera + wall balls', b: [runB('Bloque 1 · 4 series (descanso 2 min)', [r(2, 'p5+15'), r(1, 'recovery', `${bbj} m de ${X('bbj')}`), r(2, 'recovery', 'descanso')], 4), runB('Recuperación', [r(8, 'easy')]), runB('Bloque 2 · 4 series (descanso 2 min)', [r(2, 'p5+15'), r(1, 'recovery', `${wb} ${X('wallball')}`), r(2, 'recovery', 'descanso')], 4)], n: 'Sal de cada estación al trote los primeros 10 s y entra en ritmo poco a poco.' }),
    () => ({ t: 'Técnica de trineo + carrera', b: [ex('Técnica', [it(sledPush(), 3, hasSled() ? '20 m ligero' : '15 s', 90, 'Postura: brazos estirados, cadera baja'), it(sledPush(), 5, hasSled() ? '20 m moderado' : '20 s', 120, 'Ritmo medio, pasos cortos'), it(sledPull(), 4, hasSled() ? '20 m' : '12', 120, 'Tira con piernas y brazos a la vez')], 1, 22), runB('Cada 6 min × 2 · 300 m + empuje 20 m + 300 m', [rk(0.3, 'p5+15'), r(1, 'recovery', `${sledPush()} 20 m`), rk(0.3, 'p5+15'), r(2.5, 'recovery', 'descanso hasta el minuto 6')], 2)] }),
    () => ({ t: 'Específico · E3MOM + E2MOM', b: [txt('Activación · 12 min AMRAP', ['Burpee sin flexión → 10', 'Flexiones → 10', `${erg('ski', '10 cal').join(' → ')}`, 'Carrera → 2 min', 'Sit-ups → 10'], 10), runB('E3MOM 24 min · carrera / ski / carrera', [r(3, 'p5+12'), r(3, 'recovery', `${erg('ski', '3 min')[0]} 3 min a ritmo 2K +10 s`), r(3, 'p5+5')], clamp(Math.round(2 * (P.sessionMin || 60) / 60), 1, 3)), runB('E2MOM 16 min · carrera + estación', [r(2, 'p5+10'), r(2, 'recovery', `${X('farmer')} 2 min`), r(2, 'p5+10'), r(2, 'recovery', `${X('walkLunge')} 2 min`), r(2, 'p5+10'), r(2, 'recovery', `${X('wallball')} 2 min`)])], n: 'Cada bloque empieza al minuto exacto: lo que te sobra es tu descanso.' }),
    () => ({ t: 'Resistencia a la fatiga', b: [runB('Bloque de resistencia · carrera 1 km entre máquinas', [rk(1, 'p5+20'), r(4.5, 'recovery', `${erg('ski', '1000 m').join(' ')}`), rk(1, 'p5+20'), r(4.5, 'recovery', `${erg('row', '1000 m').join(' ')}`), rk(1, 'p5+20'), r(5, 'recovery', 'descanso')]), ex('Fuerza con trineo', [E('backsquat', 4, 6, 60, 'RIR 4-5'), it(sledPush(), 4, hasSled() ? '20 m' : '15 s', 150, 'Con peso de competición'), E('sumo', 4, 8, 60, 'RIR 5-6'), it(sledPull(), 4, hasSled() ? '20 m' : '12', 150)], 1, 26), ex('Finisher', [it(X('wallball'), 1, level(P, 30, 50, 75), 0, 'Series cortas antes del fallo')], 1, 5)] }),
    () => ({ t: 'Carrera + específico', b: [runB('Activación', [r(0.75, 'rep', 'aceleración'), r(1, 'recovery', 'trote')], 3), runB('Series', [rk(1, 'p5+20'), r(1.5, 'recovery', 'descanso')]), runB('4 × 500 m (descanso 60 s)', [rk(0.5, 'p5+0'), r(1, 'recovery', 'descanso')], 4), runB('Final por tiempo', [rk(0.4, 'p5+10'), r(1.5, 'recovery', `${bbj} m de ${X('bbj')}`), rk(0.4, 'p5+10'), r(2, 'recovery', `${wb} ${X('wallball')}`)])], n: 'El final es por tiempo: apúntalo y compáralo en las próximas semanas.' }),
  ];
  const pick = lib[v]();
  return { kind: 'hybrid', title: pick.t, focus: 'Correr con fatiga y estaciones', intensity: 'hard',
    blocks: [RUN_WU(), txt('Activación', ['Zancada con rotación → 5/5', 'Clamshell con banda → 5/5', 'Abridores de cadera → 5/5', 'Monster walks → 10/10'], 4), ...pick.b, RUN_CD(8)],
    notes: pick.n || 'Usa los pesos de tu categoría en las estaciones si los tienes.' };
}

/* ---------- PUESTA A PUNTO Y COMPETICIÓN ---------- */
function taperFull(P) {
  return { kind: 'strength', title: 'Full body ligero + activación', focus: 'Activar sin fatigar', intensity: 'easy',
    blocks: [txt('Calentamiento · 5 min AMRAP', [`${hasErg() ? 'Bici 20 cal' : 'Trote 2 min'}`, 'Inchworm → 6', 'Monster walks → 10+10', 'World’s greatest stretch → 2+2'], 5), MOBB('full', 8),
      ex('Fuerza ligera', [E('thruster', 3, 10, 75, 'Ligero'), E('floorpress', 3, 10, 60), E('walkLunge', 3, '20 m', 60), E('ringrow', 3, 12, 60)], 1, 18),
      runB('Activación a ritmo de competición', [r(1, P.goal === 'race' ? `race:${+P.raceKm || 5}` : 'p5+15', 'ritmo competición'), r(1, 'recovery', 'descanso')], 3)],
    notes: 'Objetivo: mantener sensaciones de competición y llegar fresca o fresco.' };
}
function preRace(P) {
  return { kind: 'run', title: 'Activación pre-competición', focus: 'Sistema nervioso a punto', intensity: 'easy',
    blocks: [txt('Calentamiento', [`${hasErg() ? 'Bici' : 'Trote'} 5 min`, 'Movilidad dinámica'], 7),
      runB('Activación', [r(0.75, P.goal === 'race' ? `race:${+P.raceKm || 5}` : 'p5+15', 'ritmo competición'), r(1, 'recovery', 'descanso')], 3),
      runB('Salidas rápidas', [r(0.25, 'rep', 'sprint'), r(1, 'recovery', 'andando')], 3), RUN_CD(5)],
    notes: 'Corta y fácil. Mañana o pasado, a competir.' };
}
function activeRest(P) {
  return { kind: 'mobility', title: 'Descarga activa', focus: 'Recuperación', intensity: 'easy',
    blocks: [txt('Elige una opción', [`Opción A: ${hasErg() ? 'bici' : 'paseo rápido o bici'} 30 min en zona 2`, 'Opción B: carrera 20-30 min en zona 2'], 30), txt('Movilidad · 15 min', [...MOB.hips, ...MOB.thor], 15), BREATH()],
    notes: 'Nada de intensidad: solo mover el cuerpo y recuperar.' };
}
function raceDay(P) {
  const hy = P.goal === 'hyrox', km = +P.raceKm || 5;
  const text = hy
    ? ['Calentamiento 10-15 min progresivo, movilidad específica y activaciones cortas.', 'Primer km más prudente de lo que te pide el cuerpo.', 'En las estaciones, ritmo constante y respiración controlada. En los wall balls, series cortas con pausas breves antes de fallar.', 'Después: enfriamiento suave, movilidad e hidratación. Registra el tiempo total y, si puedes, los parciales.']
    : ['Calentamiento 10-15 min progresivo y 3-4 aceleraciones de 60 m.', 'Primer km 5-10 s/km más lento que el objetivo, después ritmo constante y aprieta al final si queda margen.', 'Después: enfriamiento suave. Si mejoras tu 5K de referencia, actualízalo para recalcular los ritmos.'];
  return { kind: 'race', title: P.raceName || (hy ? 'Competición' : `Carrera ${RACE_KM[km] || km + ' km'}`), focus: 'Día de competición', intensity: 'hard',
    blocks: hy ? [txt('Estrategia', text, 90)] : [runB('Carrera', [rk(km, `race:${km}`, 'ritmo objetivo')]), txt('Estrategia', text, 15)],
    notes: '¡A disfrutar! Todo el trabajo ya está hecho.', ...(hy ? { duration: 90 } : {}) };
}
function test5k(P) {
  return { kind: 'run', title: 'Test 5K', focus: 'Recalcular tus ritmos', intensity: 'hard',
    blocks: [runB('Calentamiento', [rk(2, 'easy', 'suave')]), runB('Activación', [r(2, 'p5+0', 'ritmo objetivo'), r(1.5, 'recovery', 'descanso')], 3), runB('Test', [rk(5, 'p5+0', 'a tope controlado')]), RUN_CD(10)],
    notes: 'Al registrar la sesión, escribe tu tiempo total: la app te ofrecerá usarlo como nuevo 5K para recalcular todos los ritmos.' };
}
function mobilityDay() {
  return { kind: 'mobility', title: 'Movilidad y respiración', focus: 'Recuperación activa', intensity: 'easy', optional: true,
    blocks: [txt('Movilidad · 15-20 min AMRAP', ['Sentadilla goblet mantenida → 30 s', 'Sentadilla profunda → 30 s', 'Clamshell con banda → 15/15', 'Estiramiento de flexor de cadera → 30/30 s', 'Pase de hombros con palo → 20', 'Wall slides → 10'], 18), BREATH(), txt('Opcional', ['Paseo de 30-45 min'], 0)],
    notes: 'Opcional. Si estás cansada o cansado, descansa del todo.' };
}

/* ---------- plantillas semanales ---------- */
const TEMPLATES = {
  hyrox: ['strFull', 'fartlek', 'spec', 'long', 'strPost', 'hills'],
  race: ['fartlek', 'long', 'z2', 'strFull', 'hills', 'z2run'],
  hybrid: ['strFull', 'fartlek', 'circuit', 'strPost', 'long', 'z2'],
};
const HARD = new Set(['strFull', 'strPost', 'fartlek', 'hills', 'spec', 'circuit', 'long']);
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

export function generatePlan(P, fromDate) {
  CUR = P;
  const { start, end, weeks } = planWeeks(P), hasRace = P.goal !== 'hybrid' && !!P.raceDate;
  const days = (P.days && P.days.length ? P.days : [1, 3, 5, 6]).slice(0, 6);
  const tpl = TEMPLATES[P.goal || 'hybrid'].slice(0, clamp(days.length, 3, 6));
  const from = fromDate || P.startDate || iso(new Date());
  const out = [], phaseCount = {};
  let tested = false;
  for (let w = 0; w < weeks; w++) {
    const phase = phaseOf(w, weeks, hasRace);
    phaseCount[phase] = (phaseCount[phase] || 0) + 1;
    const deload = phase !== 'taper' && (w + 1) % 4 === 0;
    const ctx = { phase, week: w, wInPhase: phaseCount[phase] - 1, prog: weeks > 1 ? w / (weeks - 1) : 1, deload };
    const ws = addDays(start, w * 7);
    const lastWeek = hasRace && w === weeks - 1;
    let types = [...tpl];
    if (lastWeek) types = ['taperFull', 'fartlek', 'pre'].slice(0, Math.max(2, Math.min(3, days.length - 1)));
    else if (phase === 'taper') types = types.map(t => (t === 'strPost' || t === 'circuit' ? 'active' : t === 'strFull' ? 'taperFull' : t));
    const map = assignDays(types, days, P.longDay ?? 6);
    // en la semana de competición, la activación va lo más cerca posible de la carrera
    if (lastWeek) {
      const before = days.map(d => addDays(ws, d)).filter(d => d < P.raceDate).sort();
      map.clear(); types.forEach((t, i) => { const d = before[before.length - types.length + i]; if (d) map.set(weekday(d), t); });
    }
    for (const [d, t] of map) {
      const date = addDays(ws, d);
      if (date < from || date > end || (hasRace && date >= P.raceDate)) continue;
      let s;
      if (t === 'fartlek' && !tested && phase === 'base' && ctx.wInPhase === 2 && !deload && weeks >= 8) { s = test5k(P); tested = true; }
      else s = ({ strFull: () => strFull(P, ctx), strPost: () => strPost(P, ctx), fartlek: () => fartlek(P, ctx), hills: () => hills(P, ctx), spec: () => hyroxSpec(P, ctx), long: () => longCardio(P, ctx), circuit: () => circuitDB(P, ctx), z2: () => z2Core(P, ctx), z2run: () => z2Run(P, ctx), taperFull: () => taperFull(P), pre: () => preRace(P), active: () => activeRest(P) })[t]();
      if (deload) { s.notes = 'Semana de descarga: quita una serie o una ronda si llegas cansada o cansado, y termina con sensación de poder hacer más. ' + (s.notes || ''); s.title += ' (descarga)'; }
      out.push(finish(s, P, { date, phase, week: w + 1 }));
    }
    if (P.mobility) {
      const d = [6, 0, 1, 2, 3, 4, 5].find(x => !days.includes(x)), date = d != null ? addDays(ws, d) : null;
      if (date && date >= from && date <= end && (!hasRace || date < P.raceDate)) out.push(finish(mobilityDay(), P, { date, phase, week: w + 1 }));
    }
  }
  if (hasRace && P.raceDate >= from) out.push(finish(raceDay(P), P, { date: P.raceDate, phase: 'taper', week: weeks }));
  CUR = null;
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// duración estimada (min) y km de una sesión a partir de sus bloques
export function measure(s, profile) {
  let sec = 0, km = 0;
  for (const b of s.blocks || []) {
    const r = b.rounds || 1;
    if (b.type === 'run') for (const st of b.steps || []) {
      if (st.dur) { sec += st.dur * r; if (st.zone !== 'recovery' || !/bajar|descanso|andando|ski|bici|skipping|wall|burpee|estación|granjero|zancada|empuje|trineo|remo|sentadilla/i.test(st.label || '')) km += kmForSeconds(profile, st.zone, st.dur) * r; }
      else if (st.dist) { sec += st.dist / kmForSeconds(profile, st.zone, 1) * r; km += st.dist * r; }
    } else if (b.min != null) sec += b.min * 60;
    else if (b.type === 'exercises') for (const it of b.items || []) { const sets = +it.sets || 1, rest = +it.rest || 60; sec += r * (it.est ? +it.est : sets * (45 + rest)); }
  }
  return { min: Math.round(sec / 60), km: Math.round(km * 10) / 10 };
}
export function fitTime(o, P) {
  const lim = (P.sessionMin || 60) * (/larga|Cardio largo|Transiciones/.test(o.title) ? 1.6 : 1.2);
  for (let k = 0; k < 12 && o.kind !== 'race'; k++) {
    const m = measure(o, P); if (m.min <= lim) break;
    const cand = (o.blocks || []).filter(b => (b.rounds || 1) > 2 || (b.type === 'text' && b.min > 6 && /Movilidad|Calentamiento · 10|Resistencia/.test(b.title)));
    if (!cand.length) break;
    const b = cand.sort((x, y) => measure({ blocks: [y] }, P).min - measure({ blocks: [x] }, P).min)[0];
    if ((b.rounds || 1) > 2) { const per = (b.min || 0) / b.rounds; b.rounds--; if (b.min) b.min = Math.round(per * b.rounds); b.title = b.title.replace(/(\d+) (rondas|series|bloques)/, `${b.rounds} $2`); }
    else b.min = Math.max(5, Math.round(b.min * 0.6));
  }
  return o;
}
export function finish(s, P, extra = {}) {
  const o = fitTime({ id: uid(), time: P.time || '', optional: false, source: 'auto', ...s, ...extra, updatedAt: Date.now() }, P);
  const m = measure(o, P);
  if (!o.duration) o.duration = Math.max(15, Math.round(m.min / 5) * 5);
  if (o.distance == null && m.km) o.distance = m.km;
  return o;
}
// normaliza una sesión llegada de la IA o de una importación
export function normalize(s, P) {
  const o = { ...s };
  if (!KIND[o.kind]) o.kind = 'run';
  if (!Array.isArray(o.blocks)) o.blocks = [];
  o.blocks = o.blocks.map(b => ({ title: String(b.title || ''), type: ['run', 'exercises', 'text'].includes(b.type) ? b.type : 'text', rounds: +b.rounds || 1, ...(+b.min > 0 ? { min: +b.min } : {}),
    steps: (b.steps || []).map(x => ({ dur: +x.dur > 0 ? +x.dur : undefined, dist: +x.dist > 0 ? +x.dist : undefined, zone: x.zone === 'race' ? `race:${+P.raceKm || 5}` : x.zone || 'easy', label: x.label || '' })).filter(x => x.dur || x.dist),
    items: (b.items || []).map(x => ({ name: String(x.name || ''), sets: +x.sets || 1, reps: String(x.reps ?? ''), rest: +x.rest || 0, load: x.load || '', note: x.note || '' })), text: b.text || '' }));
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
