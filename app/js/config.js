// Configuración de la instancia. Sin supabaseUrl la app funciona igual, solo en el dispositivo y sin coach IA.
// Rellena estos dos valores con los de tu proyecto de Supabase (Project Settings › API). La clave publicable es pública por diseño:
// la seguridad la dan las políticas RLS de supabase/schema.sql.
export const CONFIG = {
  appName: 'Ritmo Híbrido',
  supabaseUrl: '',
  supabaseKey: '',
  supabaseJs: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  contact: '', // email de contacto para la página de privacidad
};
