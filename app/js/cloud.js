// Cuenta (enlace mágico por email), sincronización del estado y llamadas al coach IA.
import { CONFIG } from './config.js';
import { S, onPersist, mergeRemote, persist } from './store.js';

let sb = null, user = null, pushT = null, pulling = false;
const listeners = new Set();
export const onAuth = f => (listeners.add(f), () => listeners.delete(f));
const emit = () => listeners.forEach(f => f(user));

export const enabled = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseKey);
export const currentUser = () => user;

export async function init() {
  if (!enabled()) return;
  try {
    const { createClient } = await import(CONFIG.supabaseJs);
    sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null; emit();
    sb.auth.onAuthStateChange((_e, session) => {
      const was = user?.id; user = session?.user || null; emit();
      if (user && user.id !== was) pull();
    });
    onPersist(schedulePush);
    if (user) pull();
    addEventListener('online', () => user && pull());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user) pull(); });
  } catch (e) { console.warn('Nube no disponible', e); }
}

export async function signIn(email) {
  if (!sb) throw new Error('La sincronización no está configurada en esta instalación');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { if (sb) await sb.auth.signOut(); user = null; emit(); }

export async function pull() {
  if (!sb || !user || pulling) return;
  pulling = true;
  try {
    const { data, error } = await sb.from('user_state').select('data,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (data?.data) mergeRemote(data.data);
    await push();
  } catch (e) { console.warn('pull', e); } finally { pulling = false; }
}
function schedulePush() { if (!sb || !user) return; clearTimeout(pushT); pushT = setTimeout(push, 1500); }
export async function push() {
  if (!sb || !user) return;
  const { error } = await sb.from('user_state').upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.warn('push', error);
}

// llamada a la función del servidor; devuelve {ok, ...} o lanza un Error con .code
export async function coach(action, payload = {}) {
  if (!sb) { const e = new Error('El coach IA no está disponible en esta instalación'); e.code = 'disabled'; throw e; }
  if (!user) { const e = new Error('Inicia sesión para usar el coach IA'); e.code = 'auth'; throw e; }
  const { data, error } = await sb.functions.invoke('coach', { body: { action, ...payload } });
  if (error) {
    let body = null; try { body = await error.context?.json?.(); } catch (_) { }
    const e = new Error(body?.error || 'El coach no ha podido responder. Inténtalo en un rato.'); e.code = body?.code || 'error'; e.quota = body?.quota; throw e;
  }
  if (data?.quota) S.quota = data.quota, persist({ silent: true, noPush: true });
  return data;
}

export async function deleteAccount() {
  await coach('delete_account');
  await signOut();
}
