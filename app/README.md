# Ritmo Híbrido · app pública de entrenamiento híbrido

App web (PWA) para que cualquier persona prepare una **competición de fitness híbrido** (carrera + estaciones), una **carrera a pie** (5K a maratón) o simplemente **ponerse en forma** combinando fuerza y resistencia.

Es independiente de la app de Amaia (la de la raíz del repositorio): no comparte código, datos ni base de datos.

## Qué hace

- **Alta guiada** en 6 pasos: objetivo, fecha, nivel y 5K, días disponibles, material y lesiones.
- **Plan completo hasta el objetivo**, por fases (base, desarrollo, específico, puesta a punto) con semanas de descarga:
  - **Plan automático**: se genera al instante en el dispositivo, sin cuenta ni IA.
  - **Coach IA**: diseña bloques de 6 semanas teniendo en cuenta cómo te ha ido. El resto hasta la carrera se completa con el plan automático.
- **Método de entrenamiento** inspirado en la metodología del entrenador de la app de Amaia, adaptado a cualquier nivel y material:
  - sesiones de fuerza con calentamiento 15″/15″, movilidad en AMRAP, fuerza con RIR (rampa RIR 4→1 en base), core, conditioning o metcon, vuelta a la calma y respiración;
  - carrera con ritmos «ritmo 5K +X s»: fartleks por bloques de 5 min, progresivos, cuestas e intervalos;
  - cardio largo combinando ergómetros y carrera;
  - específicos de competición híbrida: trineos, carrera + burpee broad jump / wall balls, E2MOM y E3MOM;
  - circuito de fuerza-resistencia con mancuernas, test de 5K y puesta a punto de activación.
  Los textos son propios: se adapta el método, no se copia el PDF.
- **Ritmos por zonas** calculados con tu 5K. Cambias el 5K y se recalcula todo el plan. Se pueden ver en min/km o en km/h para la cinta.
- **Guía de carrera por voz** paso a paso, con pitidos, vibración y la pantalla siempre encendida.
- **Modo gimnasio**: series con botones + y −, pesos de la última vez y descanso automático.
- **Registro** de esfuerzo (RPE), duración, distancia, molestias y notas.
- **Gestión del plan**: mover, editar, descartar, eliminar (con papelera) y **historial de versiones** de cada sesión.
- **Progreso**: cumplimiento, kilómetros y minutos por semana, aviso de subida brusca de carga, molestias, tabla de ritmos, previsión de marcas y mejores pesos.
- **Coach IA por chat**: conoce tu plan y tus registros, y propone cambios que aplicas o descartas.
- **Cuenta opcional** con enlace mágico por email: sincroniza entre dispositivos.
- **Datos**: exportar, importar, borrar todo en el dispositivo y borrar la cuenta en el servidor.
- **Interfaz**: funciona sin conexión y tiene tema claro u oscuro.

## Estructura

```
app/
  index.html, manifest.webmanifest, sw.js, icons/
  css/app.css
  js/
    config.js      ← la configuración de tu instalación (Supabase)
    main.js        arranque y navegación
    store.js       datos locales, historial, sincronización (fusión)
    engine.js      generador de planes sin IA y formato de sesión
    paces.js       zonas y ritmos a partir del 5K
    ai.js          contexto para la IA, bloques y cambios del chat
    cloud.js       cuenta, sincronización y llamadas al coach
    views.js       pantallas Hoy, Plan, Progreso, Coach y Ajustes
    session.js     ficha de sesión, registro, edición, historial
    guide.js       guía por voz y modo gimnasio
    onboarding.js  alta guiada
supabase/
  schema.sql                 tablas, seguridad por filas y cupos
  functions/coach/index.ts   función del servidor (Claude)
```

No hay paso de compilación: son módulos de JavaScript que GitHub Pages sirve tal cual.

## Publicarla

### 1. Solo en el dispositivo (sin cuenta ni IA)

Ya funciona tal cual en `https://<usuario>.github.io/<repo>/app/`. Los datos se guardan en el navegador de cada persona.

### 2. Con cuentas y coach IA

1. **Crea un proyecto nuevo en Supabase**, distinto del de la app de Amaia.
2. **Crea las tablas.** En *SQL Editor*, ejecuta `supabase/schema.sql`.
3. **Activa el acceso por email.** En *Authentication › Providers › Email*, activa el inicio de sesión por enlace (magic link).
4. **Configura las direcciones.** En *Authentication › URL Configuration*:
   - en *Site URL*, pon la dirección de la app (por ejemplo `https://amaaia.github.io/HYBRID-AMAIA/app/`);
   - añade esa misma dirección en *Redirect URLs*.
5. **Despliega la función del coach** con la CLI de Supabase:
   ```bash
   supabase link --project-ref <ref-del-proyecto>
   ```
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<tu-clave>
   ```
   ```bash
   supabase functions deploy coach
   ```
   Secretos opcionales:
   - `COACH_CHAT_LIMIT`: mensajes al mes por persona (30 por defecto).
   - `COACH_PLAN_LIMIT`: planes con IA al mes por persona (4 por defecto).
   - `ALLOWED_ORIGIN`: tu dominio, por ejemplo `https://amaaia.github.io`, para que solo tu web pueda llamar a la función.
6. **Conecta la app con tu proyecto.** En `app/js/config.js`, rellena:
   - `supabaseUrl` y `supabaseKey`: la clave publicable está en *Project Settings › API*;
   - `contact`: un email de contacto para la página de privacidad.
7. Sube los cambios. GitHub Pages publica en uno o dos minutos.

La clave publicable de Supabase es pública por diseño: la seguridad está en las políticas de `schema.sql`, que hacen que cada persona solo pueda leer y escribir su propia fila. La clave de Anthropic solo vive en los secretos de la función, nunca en la web.

## Coste de la IA

La función usa Claude Opus 5.5. Precio: 4 $ por millón de tokens de entrada y 20 $ por millón de salida.

| Uso | Coste aproximado |
| --- | --- |
| Mensaje de chat | 1-4 céntimos |
| Bloque de 6 semanas de plan | 10-40 céntimos (más texto de salida) |
| Persona que agota el cupo por defecto (30 mensajes y 4 planes al mes) | hasta unos 2,5 $ al mes |

Para controlar el gasto:
- Ajusta `COACH_CHAT_LIMIT` y `COACH_PLAN_LIMIT`.
- Pon un límite de gasto mensual en la consola de Anthropic.

Los cupos se devuelven si la llamada a la IA falla.

## Antes de abrirla al público

- **Contenido de entrenamiento**: el plan sigue el método (estructura de sesión, formatos y progresiones) del PDF del entrenador de la app de Amaia, con textos propios y adaptado a cada nivel y material. Si vas a presentarlo como «método de Dani» o usar su nombre, pídele permiso y acordad cómo darle crédito.
- **Marca**: «HYROX» es una marca registrada. La app la menciona solo de forma descriptiva («tipo HYROX»). No la uses en el nombre, el logo ni la publicidad sin permiso.
- **Salud**: la app avisa de que no sustituye a un profesional sanitario. Revisa con un profesional los textos sobre lesiones si vas a promocionarla.
- **Privacidad (RGPD)**: guarda datos de salud que la persona escribe, como molestias o lesiones. Antes de abrirla:
  - completa la página de privacidad (Ajustes › Privacidad) con el responsable y un contacto;
  - si hace falta, prepara un aviso legal.

  La app ya permite exportar los datos y borrar la cuenta con todos sus datos.
- **Nombre**: «Ritmo Híbrido» es provisional. Se cambia en `config.js`, `index.html` y `manifest.webmanifest`.
