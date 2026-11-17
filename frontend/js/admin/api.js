// Cliente de la API de FastAPI para el panel.
import { CONFIG } from "../config.js";

const CLAVE_TOKEN = "inkfever_token";

// sessionStorage: la sesión se cierra sola al cerrar la pestaña.
export const sesion = {
  get token() {
    return sessionStorage.getItem(CLAVE_TOKEN);
  },
  guardar(token) {
    sessionStorage.setItem(CLAVE_TOKEN, token);
  },
  cerrar() {
    sessionStorage.removeItem(CLAVE_TOKEN);
  },
};

export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

function mensajeDeError(cuerpo, estado) {
  const detalle = cuerpo?.detail;
  if (typeof detalle === "string") return detalle;
  if (Array.isArray(detalle) && detalle.length) {
    // Errores de validación de Pydantic
    return detalle.map((d) => String(d.msg || "").replace(/^Value error, /, "")).join(". ");
  }
  return `Algo salió mal en el servidor (error ${estado}). Inténtalo de nuevo.`;
}

export async function api(ruta, { metodo = "GET", datos } = {}) {
  const encabezados = {};
  if (datos !== undefined) encabezados["Content-Type"] = "application/json";
  if (sesion.token) encabezados.Authorization = `Bearer ${sesion.token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${CONFIG.apiUrl}${ruta}`, {
      method: metodo,
      headers: encabezados,
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet o espera unos segundos.", 0);
  }

  if (respuesta.status === 401 && sesion.token) {
    sesion.cerrar();
    window.dispatchEvent(new Event("sesion-expirada"));
  }
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ErrorApi(mensajeDeError(cuerpo, respuesta.status), respuesta.status);
  }
  return respuesta.status === 204 ? null : respuesta.json();
}

/** Hace una petición ligera para "despertar" la API en Render. */
export async function despertarServidor() {
  const respuesta = await fetch(`${CONFIG.apiUrl}/api/salud`);
  if (!respuesta.ok) throw new Error("La API no respondió bien");
}
