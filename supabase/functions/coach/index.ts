// Ritmo Híbrido · función "coach" (Supabase Edge Function, Deno)
// Acciones: "quota" (uso del mes), "plan" (genera un bloque de semanas), "chat" (pregunta al coach),
// "delete_account" (borra la cuenta y sus datos).
// Secretos necesarios: ANTHROPIC_API_KEY. Opcionales: COACH_CHAT_LIMIT (30), COACH_PLAN_LIMIT (4), ALLOWED_ORIGIN.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const CHAT_LIMIT = +(Deno.env.get("COACH_CHAT_LIMIT") ?? 30);
const PLAN_LIMIT = +(Deno.env.get("COACH_PLAN_LIMIT") ?? 4);
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------- formato de sesión (igual que app/js/engine.js) ---------- */
const ZONES = ["recovery", "easy", "steady", "hybrid", "tempo", "threshold", "interval", "rep", "hill", "race",
  "p5+0", "p5+5", "p5+10", "p5+15", "p5+20", "p5+25", "p5+30", "p5+45", "p5+60", "p5+70", "p5+80", "p5+90"];
const STEP = {
  type: "object", additionalProperties: false, required: ["dur", "dist", "zone", "label"],
  properties: {
    dur: { type: "integer", description: "segundos; 0 si el tramo es por distancia" },
    dist: { type: "number", description: "km; 0 si el tramo es por tiempo" },
    zone: { type: "string", enum: ZONES },
    label: { type: "string" },
  },
};
const ITEM = {
  type: "object", additionalProperties: false, required: ["name", "sets", "reps", "rest", "load", "note"],
  properties: {
    name: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" },
    rest: { type: "integer", description: "segundos de descanso entre series" },
    load: { type: "string", description: "carga orientativa o vacío" }, note: { type: "string" },
  },
};
const BLOCK = {
  type: "object", additionalProperties: false, required: ["title", "type", "rounds", "steps", "items", "text"],
  properties: {
    title: { type: "string" }, type: { type: "string", enum: ["run", "exercises", "text"] },
    rounds: { type: "integer" }, steps: { type: "array", items: STEP }, items: { type: "array", items: ITEM }, text: { type: "string" },
  },
};
const SESSION = {
  type: "object", additionalProperties: false,
  required: ["date", "kind", "title", "focus", "duration", "distance", "intensity", "optional", "notes", "blocks"],
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    kind: { type: "string", enum: ["run", "strength", "hybrid", "conditioning", "mobility", "race"] },
    title: { type: "string" }, focus: { type: "string" },
    duration: { type: "integer", description: "minutos totales" },
    distance: { type: "number", description: "km estimados de carrera; 0 si no aplica" },
    intensity: { type: "string", enum: ["easy", "moderate", "hard"] },
    optional: { type: "boolean" }, notes: { type: "string" },
    blocks: { type: "array", items: BLOCK },
  },
};
const PLAN_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "sessions"],
  properties: { summary: { type: "string" }, sessions: { type: "array", items: SESSION } },
};
const CHAT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["reply", "changes"],
  properties: {
    reply: { type: "string", description: "respuesta para la persona, en español, breve y concreta" },
    changes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["op", "id", "reason", "session"],
        properties: {
          op: { type: "string", enum: ["add", "modify", "remove"] },
          id: { type: "string", description: "id de la sesión existente; vacío en add" },
          reason: { type: "string" },
          session: SESSION,
        },
      },
    },
  },
};

const SYSTEM = `Eres un entrenador experto en entrenamiento híbrido (carrera a pie, fuerza y competiciones de fitness tipo HYROX) para personas populares de todos los niveles. Escribes en español de España, claro y cercano, sin tecnicismos innecesarios.

Principios que sigues siempre:
- Periodización por bloques (base, desarrollo, específico, puesta a punto) con una semana de descarga cada 3-4 semanas.
- Aproximadamente 80 % del volumen de carrera suave y 20 % de calidad. Nunca dos sesiones duras seguidas si se pueden separar.
- Progresión prudente: el volumen semanal no sube más de un 10 % salvo en descargas o tras un parón.
- Respeta los días disponibles, la duración habitual de sesión y el material que la persona tiene. Si no tiene una máquina o un trineo, usa sustitutos realistas.
- Los ritmos de carrera se expresan como ZONAS y la app los convierte a min/km o km/h con el 5K de la persona. Usa preferentemente «p5+N» (ritmo de 5K + N segundos por km): p5+0 ritmo 5K, p5+10/+15 vivo, p5+20/+30 umbral-tempo, p5+45/+60 moderado, p5+70/+90 zona 2 y suave. «hill» para subidas al 6-8 %, «recovery» para trote/andar o para tramos de estación dentro de un bloque de carrera, «race» para ritmo objetivo de la carrera. No escribas ritmos numéricos en los textos.

Método de entrenamiento (síguelo siempre):
- Estructura de las sesiones de fuerza y conditioning: calentamiento corto (4 min alternando 15 s de trabajo y 15 s de descanso en máquina o carrera, o 5 min AMRAP), movilidad 7-10 min AMRAP específica del día, bloque de fuerza (series de aproximación; en base, rampa de 5 repeticiones con RIR 4→3→2→1 y una serie final de 3-6; después 4 × 6-8 con RIR 2-3; cerca de la competición, RIR 4-5), core (3-5 rondas: hollow hold, V-ups, russian twist, plancha lateral, dead bug, pallof press, bird dog, puente de glúteo), conditioning o metcon (por tiempo, EMOM, E2MOM, E3MOM o rondas con descanso fijo), vuelta a la calma de 5-10 min en zona 2 y, a menudo, 5 min de respiración en caja.
- Semana tipo: fuerza + conditioning; fartlek o calidad de carrera + core; cardio largo combinando ergómetros y carrera (ski, remo, bici y carrera a ritmo 5K +60) con un finisher de autocargas; descanso o regenerativo (zona 2 + core + movilidad + respiración); fuerza de cadena posterior + conditioning o trabajo específico de trineos; cuestas o intervalos o específico de carrera + estaciones; descanso con paseo opcional de 30-45 min.
- Carrera: fartleks por bloques de 5 min (por ejemplo 2 min p5+80, 2 min p5+30, 1 min p5+10), progresivos (10-7-5-3 min de p5+60 a p5+20), cuestas de 6-8 % (series de 200 m o de 1 min, con pliometría o combinadas con llano a ritmo 5K) e intervalos (2 × 7 min p5+20 + 3 × 2 min p5+0). Siempre calentamiento progresivo de 10 min y 5-10 min de trote final.
- Específico de competición híbrida: carrera 2-3 min a p5+15 + burpee broad jump o wall balls (20-40), técnica y series de trineo (empuje y arrastre a peso de competición), E3MOM carrera/ski/carrera, E2MOM carrera + granjero/zancadas/wall balls, bloques de 1 km de carrera alternos con 1 km de ergómetro, y circuitos de fuerza-resistencia con mancuernas de 1 min de trabajo y 30 s de descanso.
- Tests periódicos: 5K, 2000 m en remo o ski y 20 min en bici; sirven para recalcular ritmos.
- Puesta a punto (última semana): full body ligero con activación a ritmo de competición, fartlek suave, descarga activa en zona 2, activación pre-competición corta (3 × 45 s a ritmo de competición y 2-3 salidas rápidas) y descanso el día anterior si hace falta.
- Adapta todo al material: sin ergómetros, sustituye por carrera, skipping, burpees o bandas; sin trineo, por cuestas o remos pesados; sin material, por peso corporal o mochila.
- Seguridad: no diagnosticas lesiones. Ante dolor agudo, que empeora o que cambia la forma de moverse, recomiendas parar y consultar con un profesional sanitario, y reduces la carga.
- Cada sesión debe poder hacerse leyendo solo la app: bloques claros, series, repeticiones, descansos y una nota breve con la clave del día.`;

function monthKey() { return new Date().toISOString().slice(0, 7); }
async function usage(uid: string) {
  const { data } = await admin.from("coach_usage").select("chat,plans").eq("user_id", uid).eq("month", monthKey()).maybeSingle();
  return { chat: data?.chat ?? 0, plans: data?.plans ?? 0, chatLimit: CHAT_LIMIT, planLimit: PLAN_LIMIT, month: monthKey() };
}

// llamada a Claude con salida JSON validada por esquema
async function ask(schema: Record<string, unknown>, user: string, effort: "low" | "medium", maxTokens: number) {
  const stream = anthropic.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw Object.assign(new Error("El coach no puede responder a esto. Prueba a reformularlo."), { code: "refusal" });
  if (msg.stop_reason === "max_tokens") throw Object.assign(new Error("La respuesta era demasiado larga. Prueba con menos semanas."), { code: "too_long" });
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "Inicia sesión para usar el coach", code: "auth" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Petición no válida", code: "bad_request" }, 400); }
  const action = String(body.action ?? "");

  if (action === "quota") return json({ ok: true, quota: await usage(uid) });

  if (action === "delete_account") {
    await admin.from("user_state").delete().eq("user_id", uid);
    await admin.from("coach_usage").delete().eq("user_id", uid);
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) return json({ error: "No se pudo borrar la cuenta: " + error.message, code: "error" }, 500);
    return json({ ok: true });
  }

  if (action !== "plan" && action !== "chat") return json({ error: "Acción desconocida", code: "bad_request" }, 400);
  const limit = action === "plan" ? PLAN_LIMIT : CHAT_LIMIT;
  const { data: taken, error: qErr } = await admin.rpc("coach_take", { p_user: uid, p_kind: action === "plan" ? "plan" : "chat", p_limit: limit });
  if (qErr) return json({ error: "No se pudo comprobar tu cupo", code: "error" }, 500);
  if (taken === -1) {
    return json({ error: action === "plan" ? "Has usado todas las generaciones de plan con IA de este mes. Puedes usar el plan automático." : "Has usado todos los mensajes del coach de este mes. Vuelven a estar disponibles el día 1.", code: "quota", quota: await usage(uid) }, 429);
  }

  try {
    const context = String(body.context ?? "").slice(0, 60000);
    if (action === "plan") {
      const from = String(body.from ?? ""), to = String(body.to ?? "");
      const prompt = `${context}\n\nCrea las sesiones del ${from} al ${to}, ambos incluidos, siguiendo las fases indicadas para cada semana. Usa solo los días disponibles de la persona (salvo la competición, que va en su fecha). En "summary" explica en 2-3 frases la idea del bloque.`;
      const out = await ask(PLAN_SCHEMA, prompt, "medium", 48000);
      const sessions = (out.sessions ?? []).filter((s: { date: string }) => s.date >= from && s.date <= to);
      return json({ ok: true, summary: out.summary ?? "", sessions, quota: await usage(uid) });
    }
    const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const convo = history.map((m: { role: string; text: string }) => `${m.role === "user" ? "PERSONA" : "COACH"}: ${String(m.text).slice(0, 2000)}`).join("\n\n");
    const prompt = `${context}\n\nCONVERSACIÓN RECIENTE:\n${convo}\n\nResponde al último mensaje de la persona. Si propones cambiar el plan, añade los cambios en "changes" (usa los id de las sesiones listadas; para "remove" repite la sesión tal cual). Si no hace falta cambiar nada, deja "changes" vacío.`;
    const out = await ask(CHAT_SCHEMA, prompt, "low", 16000);
    return json({ ok: true, reply: out.reply ?? "", changes: out.changes ?? [], quota: await usage(uid) });
  } catch (e) {
    await admin.rpc("coach_refund", { p_user: uid, p_kind: action === "plan" ? "plan" : "chat" });
    const err = e as { code?: string; message?: string; status?: number };
    if (e instanceof Anthropic.RateLimitError) return json({ error: "El coach está muy solicitado ahora mismo. Inténtalo en un minuto.", code: "busy" }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: "El servicio de IA ha fallado. Inténtalo de nuevo.", code: "upstream" }, 502);
    return json({ error: err.message ?? "Error inesperado", code: err.code ?? "error" }, 500);
  }
});
