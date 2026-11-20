// Sección "Personalizados": la playera avanza por 6 pasos según el scroll.
// En cada cambio de paso da una vuelta completa y se cambia de lado.
import { enlaceWhatsApp } from "./utils.js";

const seccion = document.getElementById("personalizados");

if (seccion) {
  const escena = seccion.querySelector(".perso-escena");
  const objeto = seccion.querySelector(".perso-objeto");
  const giro = seccion.querySelector(".perso-giro");
  const pasos = [...seccion.querySelectorAll(".perso-paso")];
  const botones = [...seccion.querySelectorAll(".perso-progreso button")];
  const chips = [...seccion.querySelectorAll(".perso-chip")];
  const colores = chips.map((chip) => chip.dataset.color);
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)");

  const TOTAL = pasos.length;
  const INICIO_GIRO = 0.62;                 // en qué parte de cada paso empieza la vuelta
  const INCLINACION = [-6, 5, -4, 6, 0, -3]; // grados de inclinación en cada paso
  const PASO_COLOR = 1;                     // índice del paso "Elige lo que más te guste"

  const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));
  const mezclar = (a, b, t) => a + (b - a) * t;
  const suavizar = (t) => t * t * (3 - 2 * t);
  const lado = (indice) => (indice % 2 === 0 ? 1 : -1); // 1 = derecha, -1 = izquierda

  let pasoMostrado = 0;
  let pendiente = false;

  seccion.querySelector(".js-whatsapp-perso").href =
    enlaceWhatsApp("Hola Ink Fever, quiero hacer un diseño personalizado.");

  function progresoDeScroll() {
    const caja = seccion.getBoundingClientRect();
    const recorrido = caja.height - window.innerHeight;
    return limitar(-caja.top / recorrido, 0, 1) * TOTAL; // de 0 a 6
  }

  function actualizar() {
    pendiente = false;
    const progreso = Math.min(progresoDeScroll(), TOTAL - 0.0001);
    const indice = Math.floor(progreso);
    const fraccion = progreso - indice;
    const esUltimo = indice === TOTAL - 1;

    // Transición hacia el siguiente paso: 0 = quieta, 1 = ya llegó
    const t = esUltimo ? 0 : suavizar(limitar((fraccion - INICIO_GIRO) / (1 - INICIO_GIRO), 0, 1));
    const siguiente = Math.min(indice + 1, TOTAL - 1);

    const amplitud = window.innerWidth >= 768 ? window.innerWidth * 0.2 : window.innerWidth * 0.08;
    const x = mezclar(lado(indice), lado(siguiente), t) * amplitud;
    const inclinacion = mezclar(INCLINACION[indice], INCLINACION[siguiente], t);

    // Vuelta completa entre pasos, más un balanceo suave mientras está quieta
    const vueltas = sinMovimiento.matches ? 0 : (indice + t) * 360;
    const balanceo = sinMovimiento.matches ? 0 : Math.sin(fraccion * Math.PI) * 14 * (1 - t);

    objeto.style.setProperty("--x", `${x.toFixed(1)}px`);
    giro.style.setProperty("--ry", `${(vueltas + balanceo).toFixed(1)}deg`);
    giro.style.setProperty("--rz", `${inclinacion.toFixed(2)}deg`);

    // El cambio visual ocurre a media vuelta, cuando la playera está de canto
    const paso = t > 0.5 ? siguiente : indice;
    if (paso !== pasoMostrado) mostrarPaso(paso);

    pintarColor(paso, indice, fraccion);
  }

  function mostrarPaso(paso) {
    pasoMostrado = paso;
    escena.dataset.paso = String(paso + 1);
    escena.dataset.lado = lado(paso) === 1 ? "derecha" : "izquierda";
    pasos.forEach((elemento, i) => {
      const activo = i === paso;
      elemento.classList.toggle("activo", activo);
      elemento.inert = !activo; // los pasos ocultos no reciben foco
    });
    botones.forEach((boton, i) => {
      if (i === paso) boton.setAttribute("aria-current", "step");
      else boton.removeAttribute("aria-current");
    });
  }

  // Paso 2: el color cambia mientras haces scroll y termina en negro
  function pintarColor(paso, indice, fraccion) {
    let elegido;
    if (paso < PASO_COLOR) elegido = 0;
    else if (paso > PASO_COLOR) elegido = colores.length - 1;
    else if (indice < PASO_COLOR) elegido = 0;
    else elegido = Math.min(colores.length - 1, Math.floor((fraccion / INICIO_GIRO) * colores.length));

    escena.style.setProperty("--color-playera", colores[elegido]);
    chips.forEach((chip, i) => chip.classList.toggle("activo", paso === PASO_COLOR && i === elegido));
  }

  function alHacerScroll() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(actualizar);
  }

  // Los botones de progreso llevan al inicio de cada paso
  botones.forEach((boton, i) => {
    boton.addEventListener("click", () => {
      const recorrido = seccion.offsetHeight - window.innerHeight;
      const destino = seccion.offsetTop + recorrido * ((i + 0.25) / TOTAL);
      window.scrollTo({ top: destino, behavior: sinMovimiento.matches ? "auto" : "smooth" });
    });
  });

  mostrarPaso(0);
  actualizar();
  window.addEventListener("scroll", alHacerScroll, { passive: true });
  window.addEventListener("resize", alHacerScroll);
}
