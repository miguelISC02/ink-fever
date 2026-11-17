import { CONFIG } from "./config.js";

// Dos tamaños fijos de imagen = pocas transformaciones en Cloudinary (menos créditos).
export const TAMANOS = {
  miniatura: "c_fill,g_auto,ar_4:5,w_480,f_auto,q_auto",
  detalle: "c_limit,w_1000,f_auto,q_auto",
};

/** Inserta una transformación de Cloudinary en una URL de imagen. */
export function urlCloudinary(url, transformacion) {
  if (!url || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/${transformacion}/`);
}

export const NOMBRE_TIPO = { playera: "Playera", sudadera: "Sudadera" };

export function enlaceWhatsApp(mensaje) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

export function mensajeParaPrenda(prenda) {
  const tipo = (NOMBRE_TIPO[prenda.tipo] || "prenda").toLowerCase();
  return `Hola Ink Fever, me interesa la ${tipo} "${prenda.nombre}". ¿Qué tallas y precio tienen?`;
}

export const enlaceInstagram = () => `https://instagram.com/${CONFIG.instagram}`;

/** Crea un elemento con atributos e hijos. El texto siempre se inserta como texto (seguro contra XSS). */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    if (clave === "class") nodo.className = valor;
    else if (clave === "dataset") Object.assign(nodo.dataset, valor);
    else if (clave.startsWith("on") && typeof valor === "function") nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? "" : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export function debounce(fn, espera = 300) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), espera);
  };
}
