// Configuración pública del sitio. Todo lo de aquí es visible en el navegador,
// así que NUNCA pongas secretos (ni la service_role de Supabase ni el API secret de Cloudinary).
export const CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://kdlswnappwvjnoaykdja.supabase.co/rest/v1",
  supabaseKey: "sb_publishable_GsKHknULBkH40IOwtGgIVg_HsLpZiGM",

  // URL de tu API de FastAPI (en Render, algo como https://ink-fever-api.onrender.com)
  apiUrl: "http://127.0.0.1:8000",

  // Contacto. WhatsApp con lada de país y sin "+" ni espacios: 52 + 10 dígitos
  whatsapp: "5572281869",
  instagram: "inkfever",
};
