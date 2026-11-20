// Página "Personalizados": cada paso es una sección y la playera reacciona al scroll.
// Al entrar, la playera llega girando desde su lado; al salir, gira hacia el lado contrario.
import { enlaceInstagram, enlaceWhatsApp } from "./utils.js";

// ---------- Enlaces de contacto ----------
const mensaje = enlaceWhatsApp("Hola Ink Fever, quiero hacer un diseño personalizado.");
document.querySelectorAll(".js-whatsapp, .js-whatsapp-perso").forEach((a) => (a.href = mensaje));
document.querySelectorAll(".js-instagram").forEach((a) => (a.href = enlaceInstagram()));
document.getElementById("anio").textContent = new Date().getFullYear();

// ---------- Animación por sección ----------
const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)");
const INCLINACION = [-5, 4, -3, 5, -2, 3]; // grados en que queda cada playera

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));
const suavizar = (t) => t * t * (3 - 2 * t);

const pasos = [...document.querySelectorAll(".paso")].map((seccion, indice) => ({
  seccion,
  indice,
  prenda: seccion.querySelector(".playera"),
  visual: seccion.querySelector(".paso-visual"),
  // Pasos 1, 3 y 5 entran desde la izquierda; 2, 4 y 6 desde la derecha
  direccion: indice % 2 === 0 ? -1 : 1,
  muestras: [...seccion.querySelectorAll(".muestra")],
}));

let pendiente = false;

function actualizarPaso(paso, alto) {
  const { seccion, prenda, visual, direccion, indice } = paso;
  const caja = seccion.getBoundingClientRect();
  if (caja.bottom < -alto * 0.25 || caja.top > alto * 1.25) return; // lejos de la pantalla

  const mitad = alto / 2 + caja.height / 2;
  const centro = caja.top + caja.height / 2;
  const entrada = limitar((alto - caja.top) / mitad, 0, 1);          // 1 cuando está centrada
  const salida = limitar((alto / 2 - centro) / mitad, 0, 1);         // crece al irse hacia arriba
  const final = limitar((entrada - 0.8) / 0.2, 0, 1);

  seccion.style.setProperty("--e", entrada.toFixed(3));
  seccion.style.setProperty("--s", salida.toFixed(3));
  seccion.style.setProperty("--k", final.toFixed(3));

  if (paso.muestras.length) pintarColor(paso, entrada);
  if (sinMovimiento.matches) return;

  const falta = 1 - suavizar(entrada);
  const ancho = visual.offsetWidth;

  // Entra desde su lado girando; al salir gira y se desplaza hacia el lado contrario
  const x = direccion * falta * ancho * 0.9 - direccion * salida * ancho * 0.25;
  const y = falta * 40 - salida * 60;
  const giroY = direccion * -falta * 100 - direccion * salida * 40;
  const giroZ = direccion * falta * -12 + INCLINACION[indice] * (1 - falta) - direccion * salida * 6;

  prenda.style.setProperty("--px", `${x.toFixed(1)}px`);
  prenda.style.setProperty("--py", `${y.toFixed(1)}px`);
  prenda.style.setProperty("--ry", `${giroY.toFixed(1)}deg`);
  prenda.style.setProperty("--rz", `${giroZ.toFixed(2)}deg`);
}

// Paso 2: mientras bajas, la playera pasa por cada color de las muestras
function pintarColor(paso, entrada) {
  const { muestras, seccion } = paso;
  const avance = limitar((entrada - 0.12) / 0.83, 0, 0.999);
  const elegido = Math.floor(avance * muestras.length);
  seccion.style.setProperty("--color-playera", muestras[elegido].dataset.color);
  muestras.forEach((muestra, i) => muestra.classList.toggle("activa", i === elegido));
}

function actualizar() {
  pendiente = false;
  const alto = window.innerHeight;
  pasos.forEach((paso) => actualizarPaso(paso, alto));
}

function programar() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(actualizar);
}

window.addEventListener("scroll", programar, { passive: true });
window.addEventListener("resize", programar);
sinMovimiento.addEventListener("change", programar);
actualizar();
