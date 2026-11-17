// HYROX Bilbao · widget para iPhone (app Scriptable)
// Muestra la próxima sesión, la semana y la cuenta atrás a las carreras, leyendo tu plan de la app.
// Instalación: Scriptable › + › pega este código › ejecútalo una vez para iniciar sesión › añade un widget de Scriptable y elige este script.
// La contraseña no se guarda: solo se guarda en el Llavero del iPhone un token de sesión que se renueva solo.

const APP_URL = 'https://amaaia.github.io/HYBRID-AMAIA/';
const SB_URL = 'https://lkzotoyffukmamvrfhjb.supabase.co';
const SB_KEY = 'sb_publishable_fPrXQMyahD4TtM8L5MWajg_7Ng6MtvJ';
const KC = 'hyroxBilbao.refresh';
const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), 'hyrox-widget-cache.json');

const C = {
  bg: new Color('#1d2026'), bg2: new Color('#2a2e36'), ink: Color.white(), mut: new Color('#9aa3b2'),
  run: new Color('#6fb7ff'), str: new Color('#ff8a5c'), ok: new Color('#6fe3a6'), warn: new Color('#ffb84d'), race: new Color('#ffd84d')
};

// ---------- sesión de Supabase ----------
async function auth(body, grant) {
  const r = new Request(`${SB_URL}/auth/v1/token?grant_type=${grant}`);
  r.method = 'POST';
  r.headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (!j.access_token) throw new Error(j.error_description || j.msg || 'No se pudo iniciar sesión');
  Keychain.set(KC, j.refresh_token);
  return j;
}
async function login() {
  const a = new Alert();
  a.title = 'HYROX Bilbao';
  a.message = 'Inicia sesión con la misma cuenta que usas en la app. La contraseña no se guarda.';
  a.addTextField('Email');
  a.addSecureTextField('Contraseña');
  a.addAction('Entrar');
  a.addCancelAction('Cancelar');
  if (await a.present() === -1) throw new Error('Inicio de sesión cancelado');
  return auth({ email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) }, 'password');
}
async function session() {
  if (Keychain.contains(KC)) {
    try { return await auth({ refresh_token: Keychain.get(KC) }, 'refresh_token'); } catch (e) { if (config.runsInWidget) throw e; }
  }
  if (config.runsInWidget) throw new Error('login');
  return login();
}
async function get(path, tok) {
  const r = new Request(`${SB_URL}/rest/v1/${path}`);
  r.headers = { apikey: SB_KEY, Authorization: 'Bearer ' + tok };
  return r.loadJSON();
}
async function loadData() {
  const s = await session(), uid = s.user.id, t = s.access_token;
  const [plan, logs, det] = await Promise.all([
    get(`plan_state?select=data&user_id=eq.${uid}`, t),
    get(`training_logs?select=id&user_id=eq.${uid}`, t),
    get(`session_details?select=session_id,data&user_id=eq.${uid}`, t)
  ]);
  const st = {};
  (logs || []).forEach(l => st[l.id] = 'done');
  (det || []).forEach(d => { if (st[d.session_id] && d.data && d.data.status === 'skipped') st[d.session_id] = 'skipped'; });
  const data = { plan: (plan && plan[0] && plan[0].data) || [], st, at: Date.now() };
  if (!data.plan.length) throw new Error('No hay plan guardado en tu cuenta');
  fm.writeString(CACHE, JSON.stringify(data));
  return data;
}

// ---------- lógica del plan (igual que en la app) ----------
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dt = s => new Date(s + 'T12:00:00');
const today = iso(new Date());
const idOf = s => s.date + '_' + s.title;
const isOpt = s => s.planCategory === 'optional' || (s.optional === true && s.planCategory !== 'rest');
const isRace = s => s.planCategory === 'race' || /^Carrera\b|HYROX Bilbao/i.test(s.title);
const days = d => Math.round((dt(d) - dt(today)) / 864e5);
const short = t => t.replace(/^S\d+\s*·\s*/, '').replace(/^Running\s*[-·]\s*/, '').replace(/^HYROX\s*·\s*/, '');
const icon = s => isRace(s) ? (/HYROX Bilbao/.test(s.title) ? '🏆' : '🏁') : s.kind === 'running' ? '🏃‍♀️' : '💪';
const when = d => { const n = days(d); return n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : dt(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' }); };
const monday = d => { const x = dt(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };

function model(D) {
  const P = D.plan.filter(s => s.planCategory !== 'rest' && !s.dismissed).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  const open = s => !D.st[idOf(s)];
  const up = P.filter(s => s.date >= today && open(s));
  const next = up.find(s => !isOpt(s)) || up[0] || null;
  const after = next ? up.filter(s => s !== next && !isOpt(s))[0] : null;
  const ws = monday(today), we = iso(new Date(dt(ws).getTime() + 6 * 864e5));
  const week = P.filter(s => s.date >= ws && s.date <= we && !isOpt(s));
  const done = week.filter(s => D.st[idOf(s)] === 'done').length;
  const races = P.filter(s => isRace(s) && s.date >= today);
  return { next, after, week, done, races, hyrox: races.find(s => /HYROX Bilbao/.test(s.title)) };
}

// ---------- widget ----------
function txt(st, t, size, color, bold) { const x = st.addText(t); x.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); x.textColor = color || C.ink; return x; }
function bar(st, frac, w) {
  const ctx = new DrawContext(); ctx.size = new Size(w, 6); ctx.opaque = false; ctx.respectScreenScale = true;
  const p = new Path(); p.addRoundedRect(new Rect(0, 0, w, 6), 3, 3); ctx.addPath(p); ctx.setFillColor(C.bg2); ctx.fillPath();
  if (frac > 0) { const q = new Path(); q.addRoundedRect(new Rect(0, 0, Math.max(6, w * frac), 6), 3, 3); ctx.addPath(q); ctx.setFillColor(C.ok); ctx.fillPath(); }
  st.addImage(ctx.getImage()).imageSize = new Size(w, 6);
}
function sessBlock(st, s, big) {
  txt(st, `${icon(s)} ${when(s.date)} · ${s.time || ''}`, big ? 13 : 11, s.kind === 'running' ? C.run : C.str, true);
  st.addSpacer(2);
  const t = txt(st, short(s.title), big ? 17 : 14, C.ink, true); t.lineLimit = 2; t.minimumScaleFactor = 0.7;
  st.addSpacer(2);
  txt(st, `${s.duration || '?'} min${s.distancePlanned ? ' · ' + String(s.distancePlanned).replace('.', ',') + ' km' : ''}`, 11, C.mut);
}

function build(D, err) {
  const w = new ListWidget(), fam = config.widgetFamily || 'medium';
  w.backgroundColor = C.bg; w.url = APP_URL; w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60e3);
  if (!D) { txt(w, 'HYROX Bilbao', 14, C.ink, true); w.addSpacer(6); txt(w, err === 'login' ? 'Abre Scriptable y ejecuta este script una vez para iniciar sesión.' : 'Sin datos: ' + err, 12, C.mut); return w; }
  const M = model(D);
  if (fam === 'accessoryRectangular' || fam === 'accessoryInline' || fam === 'accessoryCircular') {
    if (fam === 'accessoryCircular') { txt(w, M.hyrox ? String(days(M.hyrox.date)) : '—', 18, C.ink, true).centerAlignText(); txt(w, 'días', 9, C.ink).centerAlignText(); return w; }
    if (M.next) { txt(w, `${icon(M.next)} ${when(M.next.date)} ${M.next.time || ''}`, 12, C.ink, true); txt(w, short(M.next.title), 12, C.ink).lineLimit = 1; }
    if (fam === 'accessoryRectangular' && M.hyrox) txt(w, `🏆 HYROX en ${days(M.hyrox.date)} días`, 11, C.ink);
    return w;
  }
  const head = w.addStack(); head.centerAlignContent();
  txt(head, 'HYROX BILBAO', 10, C.mut, true); head.addSpacer();
  if (M.hyrox) txt(head, `🏆 ${days(M.hyrox.date)} d`, 10, C.race, true);
  w.addSpacer(8);
  if (fam === 'small') {
    if (M.next) sessBlock(w, M.next, false); else txt(w, 'Plan completado 🎉', 14, C.ink, true);
    w.addSpacer();
    txt(w, `Semana ${M.done}/${M.week.length}`, 10, C.mut, true); w.addSpacer(3); bar(w, M.week.length ? M.done / M.week.length : 0, 120);
    return w;
  }
  const row = w.addStack(); row.topAlignContent();
  const L = row.addStack(); L.layoutVertically();
  if (M.next) sessBlock(L, M.next, true); else txt(L, 'Plan completado 🎉', 16, C.ink, true);
  row.addSpacer(12);
  const R = row.addStack(); R.layoutVertically(); R.size = new Size(110, 0);
  if (M.after) { txt(R, 'DESPUÉS', 9, C.mut, true); R.addSpacer(2); const a = txt(R, `${icon(M.after)} ${short(M.after.title)}`, 11, C.ink); a.lineLimit = 2; txt(R, when(M.after.date), 10, C.mut); R.addSpacer(6); }
  M.races.filter(s => !/HYROX Bilbao/.test(s.title)).slice(0, 1).forEach(s => { txt(R, 'PRÓXIMA CARRERA', 9, C.mut, true); R.addSpacer(2); const t = txt(R, `🏁 ${short(s.title.replace(/^Carrera\s*/, ''))}`, 11, C.race, true); t.lineLimit = 1; txt(R, days(s.date) === 0 ? '¡hoy!' : `en ${days(s.date)} días`, 10, C.mut); });
  w.addSpacer();
  const f = w.addStack(); f.centerAlignContent();
  txt(f, `Semana ${M.done}/${M.week.length}`, 10, C.mut, true); f.addSpacer(8); bar(f, M.week.length ? M.done / M.week.length : 0, fam === 'large' ? 220 : 170);
  if (fam === 'large') {
    w.addSpacer(10);
    M.week.forEach(s => {
      const st = D.st[idOf(s)], r = w.addStack(); r.centerAlignContent();
      txt(r, st === 'done' ? '✓' : st === 'skipped' ? '✕' : s.date < today ? '·' : icon(s), 12, st === 'done' ? C.ok : st === 'skipped' ? C.warn : C.ink, true); r.addSpacer(8);
      const d = txt(r, dt(s.date).toLocaleDateString('es-ES', { weekday: 'short' }), 12, s.date === today ? C.ink : C.mut, s.date === today); r.addSpacer(8);
      const t = txt(r, short(s.title), 12, st ? C.mut : C.ink); t.lineLimit = 1; r.addSpacer();
      txt(r, `${s.duration || ''}′`, 11, C.mut); w.addSpacer(4);
    });
  }
  return w;
}

let D = null, err = '';
try { D = await loadData(); } catch (e) {
  err = e.message;
  if (fm.fileExists(CACHE)) { try { D = JSON.parse(fm.readString(CACHE)); } catch (x) {} }
}
const widget = build(D, err);
if (config.runsInWidget) Script.setWidget(widget);
else { await widget.presentMedium(); if (D && !err) { const a = new Alert(); a.title = 'Listo'; a.message = 'Ya puedes añadir el widget: mantén pulsada la pantalla de inicio › + › Scriptable › elige tamaño › mantén pulsado el widget › Editar › Script: este.'; a.addAction('OK'); await a.present(); } }
Script.complete();
