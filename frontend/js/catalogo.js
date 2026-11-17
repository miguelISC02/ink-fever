// Lectura pública del catálogo directo desde Supabase (solo lectura, protegido con RLS).
import { CONFIG } from "./config.js";

const encabezados = {
  apikey: CONFIG.supabaseKey,
  "Content-Type": "application/json",
};

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { ...encabezados, ...opciones.headers },
  });
  if (!respuesta.ok) throw new Error(`Supabase respondió ${respuesta.status}`);
  return respuesta.json();
}

export function obtenerCategorias() {
  return pedir("categorias?select=nombre,slug&order=orden.asc,nombre.asc");
}

/**
 * Busca prendas visibles. Devuelve una página de resultados.
 * @param {{texto?: string, categoria?: string, tipo?: string, limite: number, offset: number}} filtros
 */
export function buscarPrendas({ texto = null, categoria = null, tipo = null, limite, offset }) {
  return pedir("rpc/buscar_prendas", {
    method: "POST",
    body: JSON.stringify({
      p_texto: texto || null,
      p_categoria: categoria || null,
      p_tipo: tipo || null,
      p_limite: limite,
      p_offset: offset,
    }),
  });
}
