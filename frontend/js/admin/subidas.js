// Subida de imágenes directo a Cloudinary con una firma que da nuestra API.
import { api } from "./api.js";

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const MAXIMO_MB = 8;

/** Devuelve un mensaje de error, o null si el archivo es válido. */
export function validarArchivo(archivo) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) return `${archivo.name}: solo se aceptan JPG, PNG o WebP.`;
  if (archivo.size > MAXIMO_MB * 1024 * 1024) return `${archivo.name}: pesa más de ${MAXIMO_MB} MB.`;
  return null;
}

/**
 * Sube una imagen y devuelve { public_id, secure_url }.
 * @param {File} archivo
 * @param {(porcentaje: number) => void} alProgresar
 */
export async function subirImagen(archivo, alProgresar) {
  const { url_subida, parametros } = await api("/api/admin/cloudinary/firma", { metodo: "POST" });

  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(parametros)) formulario.append(clave, valor);
  formulario.append("file", archivo);

  // XMLHttpRequest en lugar de fetch para poder mostrar el progreso de subida.
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url_subida);
    xhr.upload.addEventListener("progress", (evento) => {
      if (evento.lengthComputable) alProgresar(Math.round((evento.loaded / evento.total) * 100));
    });
    xhr.addEventListener("load", () => {
      let cuerpo = null;
      try {
        cuerpo = JSON.parse(xhr.responseText);
      } catch { /* respuesta vacía o no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && cuerpo?.public_id) {
        resolver({ public_id: cuerpo.public_id, secure_url: cuerpo.secure_url });
      } else {
        rechazar(new Error(cuerpo?.error?.message || "Cloudinary rechazó la imagen."));
      }
    });
    xhr.addEventListener("error", () => rechazar(new Error("Se perdió la conexión al subir la imagen.")));
    xhr.send(formulario);
  });
}
