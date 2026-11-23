// Ritmos de entrenamiento a partir del 5K actual. Todas las sesiones guardan la ZONA, no el ritmo:
// así, cuando cambia tu 5K, todo el plan se recalcula solo.
import { hms, toSec, n1 } from './util.js';

export const LEVEL_5K = { beginner: 33 * 60, intermediate: 27 * 60, advanced: 22 * 60 };

// factores sobre el ritmo de 5K (seg/km): [más rápido, más lento]
export const ZONES = {
  recovery: { f: [1.40, 1.50], name: 'Recuperación', hint: 'Muy suave, podrías cantar', rpe: '2' },
  easy: { f: [1.25, 1.38], name: 'Suave', hint: 'Conversacional', rpe: '3-4' },
  steady: { f: [1.15, 1.22], name: 'Moderado', hint: 'Cómodo pero con frases cortas', rpe: '5' },
  hybrid: { f: [1.07, 1.13], name: 'Ritmo de carrera híbrida', hint: 'El que mantendrías entre estaciones', rpe: '6-7' },
  tempo: { f: [1.08, 1.12], name: 'Tempo', hint: 'Controlado y exigente', rpe: '6-7' },
  threshold: { f: [1.03, 1.07], name: 'Umbral', hint: 'Duro pero sostenible 20-30 min', rpe: '7-8' },
  interval: { f: [0.98, 1.02], name: 'Ritmo 5K', hint: 'Series de 3-5 min', rpe: '8-9' },
  rep: { f: [0.91, 0.95], name: 'Rápido', hint: 'Series cortas, técnica fluida', rpe: '9' },
  hill: { f: [1.10, 1.20], name: 'Cuesta 6-8 %', hint: 'Esfuerzo fuerte y constante; el ritmo no importa', rpe: '8' },
};

// tiempo objetivo en una distancia a partir del 5K (fórmula de Riegel)
export const predict = (fiveKsec, km) => fiveKsec * Math.pow(km / 5, 1.06);

export function base5k(profile) {
  const s = toSec(profile?.fiveK);
  return s && s > 12 * 60 && s < 60 * 60 ? s : LEVEL_5K[profile?.level] || LEVEL_5K.intermediate;
}

// devuelve [rápido, lento] en seg/km para una zona o para ritmo de carrera ("race:21.1")
// "p5+30" = ritmo de 5K + 30 s/km (la notación del método: «+30 ritmo 5K»)
export const offsetOf = z => (typeof z === 'string' && /^p5\+\d+$/.test(z) ? +z.slice(3) : null);
export function paceRange(profile, zone) {
  const p5 = base5k(profile) / 5, off = offsetOf(zone);
  if (off != null) return [p5 + off - (off >= 60 ? 6 : 3), p5 + off + (off >= 60 ? 6 : 3)];
  if (zone && zone.startsWith('race:')) {
    const km = +zone.slice(5) || 5, p = predict(base5k(profile), km) / km;
    return [p * 0.99, p * 1.01];
  }
  const z = ZONES[zone] || ZONES.easy;
  return [p5 * z.f[0], p5 * z.f[1]];
}

export const paceTxt = s => hms(s);
export const kmh = s => n1(3600 / s);

// texto del objetivo: "6:05–6:15/km" o, en cinta, "9,6–9,9 km/h"
export function targetTxt(profile, zone, treadmill = false) {
  if (zone === 'hill') return treadmill ? 'inclinación 6-8 % · RPE 8' : 'esfuerzo RPE 8';
  const [a, b] = paceRange(profile, zone);
  if (treadmill) return `${kmh(b)}–${kmh(a)} km/h`;
  return `${paceTxt(a)}–${paceTxt(b)}/km`;
}
export const zoneName = z => {
  if (z && z.startsWith('race:')) return 'Ritmo de carrera';
  const off = offsetOf(z);
  if (off != null) return off === 0 ? 'Ritmo 5K' : `Ritmo 5K +${off} s`;
  return (ZONES[z] || ZONES.easy).name;
};

// estimación del tiempo de una sesión de carrera a ritmo medio de la zona
export function kmForSeconds(profile, zone, sec) {
  const [a, b] = paceRange(profile, zone);
  return sec / ((a + b) / 2);
}
