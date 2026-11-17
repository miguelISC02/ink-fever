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
