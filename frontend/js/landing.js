import { buscarPrendas, obtenerCategorias } from "./catalogo.js";
import {
  NOMBRE_TIPO, TAMANOS, debounce, el, enlaceInstagram, enlaceWhatsApp, mensajeParaPrenda, urlCloudinary,
} from "./utils.js";

const POR_PAGINA = 24;

const $ = (selector) => document.querySelector(selector);
const dom = {
  cinta: $("#cinta"),
  buscar: $("#buscar"),
  filtroCategoria: $("#filtro-categoria"),
  estado: $("#estado"),
  rejilla: $("#rejilla"),
  cargarMas: $("#cargar-mas"),
  modal: $("#modal-prenda"),
};

const estado = {
  texto: "",
  tipo: "",
  categoria: null, // { slug, nombre }
  categorias: [],
  offset: 0,
  peticion: 0, // evita que una respuesta vieja pise a una nueva
};

// ---------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------
function prepararContacto() {
  const general = enlaceWhatsApp("Hola Ink Fever, quiero información de sus diseños.");
  document.querySelectorAll(".js-whatsapp").forEach((a) => (a.href = general));
  document.querySelectorAll(".js-instagram").forEach((a) => (a.href = enlaceInstagram()));
  $("#anio").textContent = new Date().getFullYear();
}

// ---------------------------------------------------------------------
// Cinta de categorías
// ---------------------------------------------------------------------
function marcaRegistro() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "registro");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M12 1v22M1 12h22" stroke="currentColor" stroke-width="2"/>';
  return svg;
}

function grupoCinta(categorias, duplicado) {
  return el(
    "div",
    { class: "cinta-grupo", "aria-hidden": duplicado ? "true" : null },
    categorias.flatMap((categoria) => [
      el(
        "button",
        {
          type: "button",
          class: "cinta-item",
          tabindex: duplicado ? "-1" : null,
          "aria-pressed": "false",
          dataset: { slug: categoria.slug },
          onclick: () => elegirCategoria(categoria),
        },
        categoria.nombre,
      ),
      marcaRegistro(),
    ]),
  );
}

function pintarCinta() {
  const { categorias } = estado;
  if (!categorias.length) {
    dom.cinta.closest(".cinta").hidden = true;
    return;
  }
  // Se repite la lista hasta llenar la pantalla; la copia duplicada hace que el ciclo no tenga cortes.
  const repeticiones = Math.max(1, Math.ceil(8 / categorias.length));
  const lista = Array.from({ length: repeticiones }, () => categorias).flat();
  dom.cinta.replaceChildren(grupoCinta(lista, false), grupoCinta(lista, true));
}

function marcarCategoriaEnCinta() {
  dom.cinta.querySelectorAll(".cinta-item").forEach((boton) => {
    boton.setAttribute("aria-pressed", String(boton.dataset.slug === estado.categoria?.slug));
  });
}

function elegirCategoria(categoria) {
  estado.categoria = estado.categoria?.slug === categoria.slug ? null : categoria;
  pintarFiltroCategoria();
  marcarCategoriaEnCinta();
  cargar(true);
  document.getElementById("disenos").scrollIntoView();
}

function pintarFiltroCategoria() {
  if (!estado.categoria) {
    dom.filtroCategoria.replaceChildren();
    return;
  }
  dom.filtroCategoria.replaceChildren(
    el(
      "button",
      {
        type: "button",
        class: "filtro-activo",
        "aria-label": `Quitar filtro: ${estado.categoria.nombre}`,
        onclick: () => elegirCategoria(estado.categoria),
      },
      estado.categoria.nombre,
      el("span", { "aria-hidden": "true" }, "×"),
    ),
  );
}

// ---------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------
function descripcionCorta(prenda) {
  const tipo = NOMBRE_TIPO[prenda.tipo] || "Prenda";
  return prenda.categoria ? `${tipo} de ${prenda.categoria}` : tipo;
}

function tarjeta(prenda) {
  const principal = prenda.imagenes[0];
  return el(
    "li",
    { class: "prenda" },
    el(
      "button",
      { type: "button", class: "prenda-abrir", onclick: () => abrirDetalle(prenda) },
      el(
        "span",
        { class: "prenda-foto" },
        principal &&
          el("img", {
            src: urlCloudinary(principal.url, TAMANOS.miniatura),
            alt: prenda.nombre,
            loading: "lazy",
            decoding: "async",
            width: "480",
            height: "600",
          }),
      ),
      el("span", { class: "prenda-nombre" }, prenda.nombre),
      el("span", { class: "prenda-meta" }, descripcionCorta(prenda)),
    ),
    el(
      "div",
      { class: "prenda-pedir" },
      el(
        "a",
        {
          class: "btn btn-contorno btn-sm w-100",
          href: enlaceWhatsApp(mensajeParaPrenda(prenda)),
          target: "_blank",
          rel: "noopener",
          "aria-label": `Pedir ${prenda.nombre} por WhatsApp`,
        },
        "Lo quiero",
      ),
    ),
  );
}

function esqueletos(cantidad = 8) {
  return Array.from({ length: cantidad }, () =>
    el(
      "li",
      { class: "prenda prenda-cargando", "aria-hidden": "true" },
      el("span", { class: "prenda-foto" }),
      el("span", { class: "linea" }),
      el("span", { class: "linea" }),
    ),
  );
}

function mostrarEstado(titulo, detalle, accion) {
  dom.estado.replaceChildren(
    el("strong", {}, titulo),
    el("span", {}, detalle),
    accion &&
      el("div", { class: "mt-3" }, el("button", { type: "button", class: "btn btn-contorno", onclick: accion.alHacerClic }, accion.texto)),
  );
}

function hayFiltros() {
  return Boolean(estado.texto || estado.tipo || estado.categoria);
}

function limpiarFiltros() {
  estado.texto = "";
  estado.tipo = "";
  estado.categoria = null;
  dom.buscar.value = "";
  document.getElementById("tipo-todo").checked = true;
  pintarFiltroCategoria();
  marcarCategoriaEnCinta();
  cargar(true);
}

async function cargar(reiniciar) {
  const peticion = ++estado.peticion;
  if (reiniciar) {
    estado.offset = 0;
    dom.estado.replaceChildren();
    dom.rejilla.replaceChildren(...esqueletos());
    dom.rejilla.setAttribute("aria-busy", "true");
  }
  dom.cargarMas.hidden = true;
  guardarEnUrl();

  try {
    const filas = await buscarPrendas({
      texto: estado.texto,
      categoria: estado.categoria?.slug,
      tipo: estado.tipo,
      limite: POR_PAGINA + 1,
      offset: estado.offset,
    });
    if (peticion !== estado.peticion) return;

    const pagina = filas.slice(0, POR_PAGINA);
    const tarjetas = pagina.map(tarjeta);
    if (reiniciar) dom.rejilla.replaceChildren(...tarjetas);
    else dom.rejilla.append(...tarjetas);

    estado.offset += pagina.length;
    dom.cargarMas.hidden = filas.length <= POR_PAGINA;

    if (reiniciar && pagina.length === 0) {
      if (hayFiltros()) {
        const busqueda = estado.texto ? ` con “${estado.texto}”` : "";
        mostrarEstado(
          `No encontramos diseños${busqueda}.`,
          "Prueba con otra palabra o quita los filtros.",
          { texto: "Quitar filtros", alHacerClic: limpiarFiltros },
        );
      } else {
        mostrarEstado("Todavía no hay diseños publicados.", "Vuelve pronto o síguenos en Instagram para ver los nuevos.");
      }
    }
  } catch (error) {
    if (peticion !== estado.peticion) return;
    console.error(error);
    if (reiniciar) dom.rejilla.replaceChildren();
    mostrarEstado(
      "No se pudieron cargar los diseños.",
      "Revisa tu conexión a internet e inténtalo de nuevo.",
      { texto: "Reintentar", alHacerClic: () => cargar(true) },
    );
  } finally {
    if (peticion === estado.peticion) dom.rejilla.removeAttribute("aria-busy");
  }
}

// ---------------------------------------------------------------------
// Detalle de una prenda
// ---------------------------------------------------------------------
const modal = bootstrap.Modal.getOrCreateInstance(dom.modal);

function mostrarImagen(prenda, indice) {
  const imagen = prenda.imagenes[indice];
  const principal = $("#detalle-imagen");
  principal.src = urlCloudinary(imagen.url, TAMANOS.detalle);
  principal.alt = prenda.imagenes.length > 1 ? `${prenda.nombre}, foto ${indice + 1}` : prenda.nombre;
  document.querySelectorAll("#detalle-miniaturas button").forEach((boton, i) => {
    boton.setAttribute("aria-current", String(i === indice));
  });
}

function abrirDetalle(prenda) {
  $("#detalle-tipo").textContent = descripcionCorta(prenda);
  $("#modal-titulo").textContent = prenda.nombre;
  $("#detalle-descripcion").textContent = prenda.descripcion || "";
  $("#detalle-whatsapp").href = enlaceWhatsApp(mensajeParaPrenda(prenda));

  $("#detalle-etiquetas").replaceChildren(
    ...prenda.etiquetas.map((etiqueta) =>
      el(
        "button",
        {
          type: "button",
          class: "etiqueta",
          "aria-label": `Buscar más diseños con la etiqueta ${etiqueta}`,
          onclick: () => buscarEtiqueta(etiqueta),
        },
        etiqueta,
      ),
    ),
  );

  const miniaturas = prenda.imagenes.length > 1
    ? prenda.imagenes.map((imagen, indice) =>
        el(
          "button",
          { type: "button", "aria-label": `Ver foto ${indice + 1}`, onclick: () => mostrarImagen(prenda, indice) },
          el("img", { src: urlCloudinary(imagen.url, TAMANOS.miniatura), alt: "", loading: "lazy" }),
        ),
      )
    : [];
  $("#detalle-miniaturas").replaceChildren(...miniaturas);

  if (prenda.imagenes.length) mostrarImagen(prenda, 0);
  modal.show();
}

function buscarEtiqueta(etiqueta) {
  modal.hide();
  dom.buscar.value = etiqueta;
  estado.texto = etiqueta;
  cargar(true);
  document.getElementById("disenos").scrollIntoView();
}

// ---------------------------------------------------------------------
// Filtros y URL compartible (?q=goku&tipo=playera&categoria=dragon-ball)
// ---------------------------------------------------------------------
function guardarEnUrl() {
  const parametros = new URLSearchParams();
  if (estado.texto) parametros.set("q", estado.texto);
  if (estado.tipo) parametros.set("tipo", estado.tipo);
  if (estado.categoria) parametros.set("categoria", estado.categoria.slug);
  const consulta = parametros.toString();
  history.replaceState(null, "", consulta ? `?${consulta}${location.hash}` : location.pathname + location.hash);
}

function leerDeUrl() {
  const parametros = new URLSearchParams(location.search);
  estado.texto = (parametros.get("q") || "").slice(0, 100);
  dom.buscar.value = estado.texto;

  const tipo = parametros.get("tipo");
  if (tipo === "playera" || tipo === "sudadera") {
    estado.tipo = tipo;
    document.getElementById(`tipo-${tipo}`).checked = true;
  }
  const slug = parametros.get("categoria");
  if (slug) estado.categoria = estado.categorias.find((c) => c.slug === slug) || null;
}

function conectarFiltros() {
  dom.buscar.addEventListener(
    "input",
    debounce(() => {
      const texto = dom.buscar.value.trim();
      if (texto === estado.texto) return;
      estado.texto = texto;
      cargar(true);
    }, 350),
  );

  document.querySelectorAll('input[name="tipo"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      estado.tipo = radio.value;
      cargar(true);
    });
  });

  dom.cargarMas.addEventListener("click", () => cargar(false));
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
async function iniciar() {
  prepararContacto();
  conectarFiltros();

  try {
    estado.categorias = await obtenerCategorias();
  } catch (error) {
    console.error(error);
  }
  pintarCinta();
  leerDeUrl();
  pintarFiltroCategoria();
  marcarCategoriaEnCinta();
  cargar(true);
}

iniciar();


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


