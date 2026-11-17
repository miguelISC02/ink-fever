// Configuración pública del sitio. Todo lo de aquí es visible en el navegador,
// así que NUNCA pongas secretos (ni la service_role de Supabase ni el API secret de Cloudinary).
export const CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://kdlswnappwvjnoaykdja.supabase.co",
  supabaseKey: "sb_publishable_GsKHknULBkH40IOwtGgIVg_HsLpZiGM",

  // En tu computadora usa la API local; publicado, usa la API de Render.
  apiUrl: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:8000"
    : "https://ink-fever.onrender.com", // ← cámbiala por la URL real de tu Web Service

  // Contacto. WhatsApp con lada de país y sin "+" ni espacios: 52 + 10 dígitos
  whatsapp: "5572281869",
  instagram: "inkfever",
};
