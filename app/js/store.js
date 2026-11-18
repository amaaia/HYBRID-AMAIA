// Estado de la app: primero en el dispositivo (localStorage), y en la nube si hay cuenta.
// Cada cambio de una sesión guarda su versión anterior en session.hist.
import { ls, uid, clone, today, iso } from './util.js';
import { generatePlan, normalize } from './engine.js';

const KEY = 'rh.state.v1';
const HF = ['title', 'date', 'time', 'kind', 'duration', 'distance', 'intensity', 'focus', 'notes', 'blocks', 'optional'];
const snap = s => { const o = {}; HF.forEach(k => (o[k] = s[k] ?? null)); return clone(o); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const blank = () => ({
  v: 1, onboarded: false,
  profile: { name: '', goal: 'hybrid', level: 'intermediate', fiveK: '', days: [1, 3, 5, 6], longDay: 6, sessionMin: 60, equipment: 'basic', sledAccess: false, time: '', startDate: today(), mobility: false, notes: '' },
  sessions: [], logs: {}, chat: [], trash: [], deleted: {},
  settings: { treadmill: false, theme: 'auto', voice: true },
  updatedAt: 0,
});

export const S = Object.assign(blank(), ls.get(KEY, {}));
S.settings = { ...blank().settings, ...(S.settings || {}) };
S.profile = { ...blank().profile, ...(S.profile || {}) };

const subs = new Set();
export const subscribe = f => (subs.add(f), () => subs.delete(f));
let pushHook = null;
export const onPersist = f => { pushHook = f; };

export function persist(opts = {}) {
  S.updatedAt = Date.now();
  ls.set(KEY, S);
  if (!opts.silent) subs.forEach(f => f());
  if (pushHook && !opts.noPush) pushHook();
}
export function replaceState(next) {
  const keep = S.settings;
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, blank(), next, { settings: { ...blank().settings, ...keep, ...(next.settings || {}) } });
  ls.set(KEY, S); subs.forEach(f => f());
}
export function resetAll() { replaceState(blank()); }

/* ---------- consultas ---------- */
export const byId = id => S.sessions.find(s => s.id === id);
export const logOf = s => S.logs[s.id];
export const isDone = s => logOf(s)?.status === 'done';
export const isSkipped = s => logOf(s)?.status === 'skipped';
export const sorted = () => [...S.sessions].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
export const upcoming = (from = today()) => sorted().filter(s => s.date >= from && !logOf(s) && !s.dismissed);
export const nextSession = () => upcoming().find(s => !s.optional) || upcoming()[0] || null;
export const missed = (days = 14) => { const from = iso(new Date(Date.now() - days * 864e5)), t = today(); return sorted().filter(s => s.date >= from && s.date < t && !s.optional && !s.dismissed && !isDone(s)); };
export const raceSession = () => sorted().find(s => s.kind === 'race' && s.date >= today()) || null;

/* ---------- cambios con historial ---------- */
function addHist(s, before, by) {
  if (same(before, snap(s))) return;
  s.hist = [...(s.hist || []), { at: Date.now(), by, v: before }].slice(-25);
}
export function updateSession(id, patch, by = 'Editado a mano') {
  const s = byId(id); if (!s) return null;
  const before = snap(s);
  Object.assign(s, clone(patch), { updatedAt: Date.now() });
  addHist(s, before, by);
  persist(); return s;
}
export function restoreVersion(id, idx) {
  const s = byId(id), h = s?.hist?.[idx]; if (!h) return;
  updateSession(id, h.v, 'Versión restaurada');
}
export function addSession(s, by = 'Añadida') {
  const o = normalize({ ...s, id: uid(), source: s.source || 'user' }, S.profile);
  o.hist = [{ at: Date.now(), by, v: null }].filter(() => false);
  S.sessions.push(o); persist(); return o;
}
export function removeSession(id, by = 'Eliminada') {
  const i = S.sessions.findIndex(s => s.id === id); if (i < 0) return;
  const [s] = S.sessions.splice(i, 1);
  S.deleted = { ...(S.deleted || {}), [id]: Date.now() };
  S.trash = [{ at: Date.now(), by, s }, ...(S.trash || [])].slice(0, 30);
  delete S.logs[id]; persist();
}
export function undoRemove(at) {
  const k = (S.trash || []).findIndex(t => t.at === at); if (k < 0) return;
  const [t] = S.trash.splice(k, 1); const back = t.s ? [t.s] : t.many || []; back.forEach(s => { s.updatedAt = Date.now(); if (S.deleted) delete S.deleted[s.id]; S.sessions = S.sessions.filter(x => x.id !== s.id).concat(s); }); persist();
}
export function setLog(id, data) {
  const s = byId(id); if (!s) return;
  S.logs[id] = { ...(S.logs[id] || {}), ...data, date: data.date || S.logs[id]?.date || s.date, savedAt: Date.now() };
  if (data.status === 'done') delete s.dismissed;
  persist();
}
export function clearLog(id) { delete S.logs[id]; persist(); }
export function setDismissed(id, on) { const s = byId(id); if (!s) return; if (on) s.dismissed = true; else delete s.dismissed; persist(); }

// sustituye las sesiones futuras no registradas (generadas por la app o por la IA) por unas nuevas
export function replaceFuture(list, from, to, by) {
  const keep = S.sessions.filter(s => s.date < from || (to && s.date > to) || logOf(s) || s.source === 'user' || s.locked);
  const gone = S.sessions.filter(s => !keep.includes(s));
  const now = Date.now(); S.deleted = { ...(S.deleted || {}) }; gone.forEach(s => (S.deleted[s.id] = now));
  if (gone.length) S.trash = [{ at: Date.now(), by: by + ' (sustituidas)', s: null, many: gone }, ...(S.trash || [])].slice(0, 30);
  const busy = new Set(keep.filter(s => s.date >= from).map(s => s.date + s.kind));
  const fresh = list.map(s => normalize(s, S.profile)).filter(s => !busy.has(s.date + s.kind));
  S.sessions = [...keep, ...fresh];
  persist();
  return fresh.length;
}
export function regenerateLocal(from = today()) {
  const plan = generatePlan(S.profile, from);
  return replaceFuture(plan, from, null, 'Plan regenerado');
}

/* ---------- copia de seguridad ---------- */
export const exportData = () => JSON.stringify({ app: 'ritmo-hibrido', exportedAt: new Date().toISOString(), ...S }, null, 1);
export function importData(text) {
  const o = JSON.parse(text);
  if (!o || !Array.isArray(o.sessions) || typeof o.profile !== 'object') throw new Error('El archivo no es una copia de esta app');
  delete o.app; delete o.exportedAt; replaceState(o);
}

// fusión con la copia de la nube: gana lo más reciente por sesión y por registro
export function mergeRemote(remote) {
  if (!remote || !Array.isArray(remote.sessions)) return false;
  if (!S.updatedAt || !S.onboarded) { replaceState(remote); return true; }
  const m = new Map(S.sessions.map(s => [s.id, s]));
  for (const r of remote.sessions) { const l = m.get(r.id); if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) m.set(r.id, r); }
  const deleted = { ...(remote.deleted || {}) };
  for (const [k, v] of Object.entries(S.deleted || {})) if (!deleted[k] || v > deleted[k]) deleted[k] = v;
  const logs = { ...remote.logs };
  for (const [k, v] of Object.entries(S.logs)) if (!logs[k] || (v.savedAt || 0) > (logs[k].savedAt || 0)) logs[k] = v;
  const chat = new Map([...(remote.chat || []), ...S.chat].map(c => [c.id, c]));
  const newer = (remote.updatedAt || 0) > (S.updatedAt || 0);
  Object.assign(S, {
    profile: newer ? remote.profile : S.profile,
    sessions: [...m.values()].filter(s => !(deleted[s.id] && deleted[s.id] >= (s.updatedAt || 0))), deleted,
    logs, chat: [...chat.values()].sort((a, b) => a.t - b.t).slice(-300),
    trash: newer ? remote.trash || [] : S.trash,
    onboarded: S.onboarded || remote.onboarded,
  });
  ls.set(KEY, S); subs.forEach(f => f());
  return true;
}
