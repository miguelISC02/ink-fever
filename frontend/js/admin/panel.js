import { api, despertarServidor, sesion } from "./api.js";
import { subirImagen, validarArchivo } from "./subidas.js";
import { NOMBRE_TIPO, TAMANOS, debounce, el, urlCloudinary } from "../utils.js";

const MAXIMO_FOTOS = 8;
const $ = (selector) => document.querySelector(selector);

const estado = {
  admin: null,
  categorias: [],
  prendas: { texto: "", pagina: 1, peticion: 0 },
  // Formulario de prenda abierto
  form: { id: null, imagenes: [], etiquetas: [] },
};

let contadorImagenes = 0;
const modalForm = bootstrap.Modal.getOrCreateInstance($("#modal-form"));

// =====================================================================
// Avisos (toasts)
// =====================================================================
function avisar(mensaje, tipo = "exito") {
  const toast = el(
    "div",
    {
      class: `toast align-items-center border-0 ${tipo === "error" ? "text-bg-danger" : "text-bg-dark"}`,
      role: tipo === "error" ? "alert" : "status",
      "aria-live": tipo === "error" ? "assertive" : "polite",
      "aria-atomic": "true",
    },
    el(
      "div",
      { class: "d-flex" },
      el("div", { class: "toast-body" }, mensaje),
      el("button", { type: "button", class: "btn-close btn-close-white me-2 m-auto", "data-bs-dismiss": "toast", "aria-label": "Cerrar" }),
    ),
  );
  $("#avisos").append(toast);
  toast.addEventListener("hidden.bs.toast", () => toast.remove());
  bootstrap.Toast.getOrCreateInstance(toast, { delay: tipo === "error" ? 7000 : 3500 }).show();
}

function mostrarError(contenedor, mensaje) {
  contenedor.textContent = mensaje;
  contenedor.hidden = !mensaje;
}

// =====================================================================
// Sesión
// =====================================================================
function mostrarLogin() {
  $("#vista-panel").hidden = true;
  $("#vista-login").hidden = false;
  $("#login-email").focus();
}

async function mostrarPanel() {
  $("#vista-login").hidden = true;
  $("#vista-panel").hidden = false;
  $("#admin-nombre").textContent = estado.admin.nombre;
  await cargarCategorias();
  cargarPrendas(true);
}

async function prepararServidor() {
  const aviso = $("#estado-servidor");
  // Si la API tarda, es que Render la está despertando.
  const temporizador = setTimeout(() => {
    aviso.textContent = "Despertando el servidor. La primera vez puede tardar hasta un minuto.";
  }, 2500);
  try {
    await despertarServidor();
    aviso.textContent = "";
  } catch {
    aviso.textContent = "No se pudo conectar con el servidor. Revisa la URL de la API en config.js.";
  } finally {
    clearTimeout(temporizador);
  }
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  const boton = $("#login-boton");
  const error = $("#login-error");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  if (!email || !password) {
    mostrarError(error, "Escribe tu correo y tu contraseña.");
    return;
  }

  mostrarError(error, "");
  boton.disabled = true;
  boton.textContent = "Entrando…";
  try {
    const { access_token } = await api("/api/auth/login", { metodo: "POST", datos: { email, password } });
    sesion.guardar(access_token);
    estado.admin = await api("/api/auth/yo");
    $("#login-password").value = "";
    await mostrarPanel();
  } catch (e) {
    mostrarError(error, e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Entrar";
  }
}

function cerrarSesion() {
  sesion.cerrar();
  estado.admin = null;
  mostrarLogin();
}

window.addEventListener("sesion-expirada", () => {
  modalForm.hide();
  mostrarLogin();
  mostrarError($("#login-error"), "Tu sesión expiró. Vuelve a entrar.");
});

// =====================================================================
// Categorías
// =====================================================================
async function cargarCategorias() {
  try {
    estado.categorias = await api("/api/admin/categorias");
  } catch (e) {
    avisar(`No se pudieron cargar las categorías. ${e.message}`, "error");
  }
  pintarCategorias();
  pintarOpcionesCategoria();
}

function pintarOpcionesCategoria() {
  const select = $("#prenda-categoria");
  const actual = select.value;
  select.replaceChildren(
    el("option", { value: "" }, "Sin categoría"),
    ...estado.categorias.map((c) => el("option", { value: String(c.id) }, c.activa ? c.nombre : `${c.nombre} (oculta)`)),
  );
  select.value = actual;
}

function pintarCategorias() {
  const filas = estado.categorias.map((categoria) =>
    el(
      "tr",
      {},
      el("td", {}, el("strong", {}, categoria.nombre)),
      el("td", {}, String(categoria.orden)),
      el("td", {}, categoria.activa ? "Sí" : "No"),
      el(
        "td",
        {},
        el(
          "div",
          { class: "panel-acciones" },
          el("button", { type: "button", class: "btn btn-sm btn-contorno", onclick: () => editarCategoria(categoria) }, "Editar"),
          el("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: () => borrarCategoria(categoria) }, "Borrar"),
        ),
      ),
    ),
  );
  $("#tabla-categorias").replaceChildren(
    ...(filas.length ? filas : [el("tr", {}, el("td", { colspan: "4", class: "text-body-secondary" }, "Aún no hay categorías. Crea la primera con el formulario."))]),
  );
}

function limpiarFormCategoria() {
  $("#form-categoria").reset();
  $("#categoria-id").value = "";
  $("#categoria-orden").value = "0";
  $("#titulo-form-categoria").textContent = "Nueva categoría";
  $("#categoria-cancelar").hidden = true;
  mostrarError($("#categoria-error"), "");
}

function editarCategoria(categoria) {
  $("#categoria-id").value = categoria.id;
  $("#categoria-nombre").value = categoria.nombre;
  $("#categoria-orden").value = categoria.orden;
  $("#categoria-activa").checked = categoria.activa;
  $("#titulo-form-categoria").textContent = `Editar ${categoria.nombre}`;
  $("#categoria-cancelar").hidden = false;
  $("#categoria-nombre").focus();
}

async function guardarCategoria(evento) {
  evento.preventDefault();
  const id = $("#categoria-id").value;
  const datos = {
    nombre: $("#categoria-nombre").value.trim(),
    orden: Number($("#categoria-orden").value) || 0,
    activa: $("#categoria-activa").checked,
  };
  if (datos.nombre.length < 2) {
    mostrarError($("#categoria-error"), "El nombre debe tener al menos 2 caracteres.");
    return;
  }
  try {
    await api(id ? `/api/admin/categorias/${id}` : "/api/admin/categorias", { metodo: id ? "PUT" : "POST", datos });
    avisar(id ? "Categoría actualizada" : "Categoría creada");
    limpiarFormCategoria();
    await cargarCategorias();
    cargarPrendas(true); // los nombres de categoría pudieron cambiar
  } catch (e) {
    mostrarError($("#categoria-error"), e.message);
  }
}

async function borrarCategoria(categoria) {
  const confirmar = confirm(`¿Borrar la categoría "${categoria.nombre}"?\n\nSus prendas no se borran: solo quedan sin categoría.`);
  if (!confirmar) return;
  try {
    await api(`/api/admin/categorias/${categoria.id}`, { metodo: "DELETE" });
    avisar("Categoría borrada");
    if ($("#categoria-id").value === String(categoria.id)) limpiarFormCategoria();
    await cargarCategorias();
    cargarPrendas(true);
  } catch (e) {
    avisar(e.message, "error");
  }
}

// =====================================================================
// Lista de prendas
// =====================================================================
function filaPrenda(prenda) {
  const interruptor = el("input", {
    class: "form-check-input",
    type: "checkbox",
    role: "switch",
    "aria-label": `Mostrar ${prenda.nombre} en el sitio`,
  });
  interruptor.checked = prenda.visible;

  const fila = el(
    "tr",
    { class: prenda.visible ? null : "oculta" },
    el(
      "td",
      {},
      prenda.imagenes[0] &&
        el("img", { class: "panel-miniatura", src: urlCloudinary(prenda.imagenes[0].url, TAMANOS.miniatura), alt: "", loading: "lazy" }),
    ),
    el(
      "td",
      {},
      el("strong", {}, prenda.nombre),
      prenda.etiquetas.length > 0 && el("div", { class: "etiquetas" }, prenda.etiquetas.map((e) => el("span", { class: "etiqueta" }, e))),
    ),
    el("td", {}, NOMBRE_TIPO[prenda.tipo]),
    el("td", {}, prenda.categoria || "Sin categoría"),
    el("td", {}, el("div", { class: "form-check form-switch m-0" }, interruptor)),
    el(
      "td",
      {},
      el(
        "div",
        { class: "panel-acciones" },
        el("button", { type: "button", class: "btn btn-sm btn-contorno", onclick: () => abrirFormulario(prenda.id) }, "Editar"),
        el("button", { type: "button", class: "btn btn-sm btn-outline-danger", onclick: () => borrarPrenda(prenda) }, "Borrar"),
      ),
    ),
  );

  interruptor.addEventListener("change", async () => {
    interruptor.disabled = true;
    try {
      await api(`/api/admin/prendas/${prenda.id}/visible`, { metodo: "PATCH", datos: { visible: interruptor.checked } });
      prenda.visible = interruptor.checked;
      fila.classList.toggle("oculta", !prenda.visible);
      avisar(prenda.visible ? `"${prenda.nombre}" ya se ve en el sitio` : `"${prenda.nombre}" quedó oculta`);
    } catch (e) {
      interruptor.checked = !interruptor.checked;
      avisar(e.message, "error");
    } finally {
      interruptor.disabled = false;
    }
  });

  return fila;
}

async function cargarPrendas(reiniciar) {
  const lista = estado.prendas;
  const peticion = ++lista.peticion;
  if (reiniciar) lista.pagina = 1;
  const estadoVista = $("#prendas-estado");
  $("#prendas-mas").hidden = true;

  const parametros = new URLSearchParams({ pagina: String(lista.pagina) });
  if (lista.texto) parametros.set("texto", lista.texto);

  try {
    const respuesta = await api(`/api/admin/prendas?${parametros}`);
    if (peticion !== lista.peticion) return;

    const filas = respuesta.resultados.map(filaPrenda);
    if (reiniciar) $("#tabla-prendas").replaceChildren(...filas);
    else $("#tabla-prendas").append(...filas);
    $("#prendas-mas").hidden = !respuesta.hay_mas;

    if (reiniciar && respuesta.resultados.length === 0) {
      estadoVista.replaceChildren(
        lista.texto
          ? el("span", {}, el("strong", {}, `Ninguna prenda coincide con "${lista.texto}".`), "Prueba con otra palabra.")
          : el("span", {}, el("strong", {}, "Todavía no hay prendas."), "Usa el botón Nueva prenda para subir tu primer diseño."),
      );
    } else {
      estadoVista.replaceChildren();
    }
  } catch (e) {
    if (peticion !== lista.peticion) return;
    estadoVista.replaceChildren(el("span", {}, el("strong", {}, "No se pudieron cargar las prendas."), e.message));
  }
}

async function borrarPrenda(prenda) {
  const confirmar = confirm(`¿Borrar "${prenda.nombre}"?\n\nTambién se borrarán sus fotos. Si solo quieres quitarla del sitio, usa el interruptor "Visible".`);
  if (!confirmar) return;
  try {
    await api(`/api/admin/prendas/${prenda.id}`, { metodo: "DELETE" });
    avisar("Prenda borrada");
    cargarPrendas(true);
  } catch (e) {
    avisar(e.message, "error");
  }
}

// =====================================================================
// Formulario de prenda: fotos
// =====================================================================
function pintarImagenes() {
  const { imagenes } = estado.form;
  $("#lista-imagenes").replaceChildren(
    ...imagenes.map((imagen, indice) => {
      const enProceso = imagen.estado === "subiendo";
      return el(
        "div",
        { class: `foto ${imagen.estado === "error" ? "foto-error" : ""}` },
        el("img", { src: imagen.vistaPrevia, alt: imagen.nombre ? `Foto: ${imagen.nombre}` : `Foto ${indice + 1}` }),
        indice === 0 && imagen.estado === "listo" && el("span", { class: "foto-principal" }, "Principal"),
        imagen.estado !== "listo" &&
          el(
            "div",
            { class: "foto-estado" },
            enProceso ? `Subiendo ${imagen.progreso}%` : imagen.error,
            enProceso &&
              el(
                "div",
                { class: "progress", role: "progressbar", "aria-label": "Progreso de subida", "aria-valuenow": String(imagen.progreso), "aria-valuemin": "0", "aria-valuemax": "100" },
                el("div", { class: "progress-bar", style: `width: ${imagen.progreso}%` }),
              ),
          ),
        el(
          "div",
          { class: "foto-botones" },
          el("button", { type: "button", "aria-label": "Mover a la izquierda", disabled: indice === 0, onclick: () => moverImagen(indice, -1) }, "‹"),
          el("button", { type: "button", "aria-label": "Mover a la derecha", disabled: indice === imagenes.length - 1, onclick: () => moverImagen(indice, 1) }, "›"),
          el("button", { type: "button", "aria-label": "Quitar foto", disabled: enProceso, onclick: () => quitarImagen(indice) }, "×"),
        ),
      );
    }),
  );
  $("#input-fotos").closest("label").hidden = imagenes.length >= MAXIMO_FOTOS;
}

function moverImagen(indice, direccion) {
  const lista = estado.form.imagenes;
  const destino = indice + direccion;
  [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
  pintarImagenes();
}

function quitarImagen(indice) {
  const [imagen] = estado.form.imagenes.splice(indice, 1);
  if (imagen.vistaPrevia.startsWith("blob:")) URL.revokeObjectURL(imagen.vistaPrevia);
  pintarImagenes();
}

async function agregarArchivos(archivos) {
  const errores = [];
  for (const archivo of archivos) {
    if (estado.form.imagenes.length >= MAXIMO_FOTOS) {
      errores.push(`Solo se permiten ${MAXIMO_FOTOS} fotos por prenda.`);
      break;
    }
    const error = validarArchivo(archivo);
    if (error) {
      errores.push(error);
      continue;
    }
    const imagen = {
      clave: ++contadorImagenes,
      public_id: null,
      vistaPrevia: URL.createObjectURL(archivo),
      estado: "subiendo",
      progreso: 0,
      error: null,
    };
    estado.form.imagenes.push(imagen);
    subirUna(imagen, archivo);
  }
  mostrarError($("#form-error"), errores.join(" "));
  pintarImagenes();
}

async function subirUna(imagen, archivo) {
  const formularioActual = estado.form;
  try {
    const resultado = await subirImagen(archivo, (porcentaje) => {
      imagen.progreso = porcentaje;
      if (estado.form === formularioActual) pintarImagenes();
    });
    imagen.public_id = resultado.public_id;
    imagen.estado = "listo";
  } catch (e) {
    imagen.estado = "error";
    imagen.error = e.message;
  }
  if (estado.form === formularioActual) pintarImagenes();
}

// =====================================================================
// Formulario de prenda: etiquetas
// =====================================================================
function normalizarEtiqueta(texto) {
  return texto
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function pintarEtiquetas() {
  $("#lista-etiquetas").replaceChildren(
    ...estado.form.etiquetas.map((etiqueta, indice) =>
      el(
        "span",
        { class: "etiqueta" },
        etiqueta,
        el("button", { type: "button", "aria-label": `Quitar etiqueta ${etiqueta}`, onclick: () => quitarEtiqueta(indice) }, "×"),
      ),
    ),
  );
}

function agregarEtiquetas(texto) {
  for (const parte of texto.split(",")) {
    const etiqueta = normalizarEtiqueta(parte);
    if (etiqueta && !estado.form.etiquetas.includes(etiqueta) && estado.form.etiquetas.length < 20) {
      estado.form.etiquetas.push(etiqueta);
    }
  }
  pintarEtiquetas();
}

function quitarEtiqueta(indice) {
  estado.form.etiquetas.splice(indice, 1);
  pintarEtiquetas();
  $("#input-etiqueta").focus();
}

const sugerirEtiquetas = debounce(async (texto) => {
  if (!texto) return;
  try {
    const sugerencias = await api(`/api/admin/etiquetas?q=${encodeURIComponent(texto)}`);
    $("#sugerencias-etiquetas").replaceChildren(
      ...sugerencias.filter((s) => !estado.form.etiquetas.includes(s.nombre)).slice(0, 8).map((s) => el("option", { value: s.nombre })),
    );
  } catch { /* las sugerencias son opcionales */ }
}, 250);

function conectarCampoEtiquetas() {
  const input = $("#input-etiqueta");
  input.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" || evento.key === ",") {
      evento.preventDefault();
      agregarEtiquetas(input.value);
      input.value = "";
    } else if (evento.key === "Backspace" && !input.value && estado.form.etiquetas.length) {
      estado.form.etiquetas.pop();
      pintarEtiquetas();
    }
  });
  input.addEventListener("input", () => {
    // Al elegir una sugerencia del datalist se agrega directo
    if ([...$("#sugerencias-etiquetas").options].some((o) => o.value === input.value)) {
      agregarEtiquetas(input.value);
      input.value = "";
      return;
    }
    sugerirEtiquetas(normalizarEtiqueta(input.value));
  });
  input.addEventListener("blur", () => {
    if (input.value.trim()) {
      agregarEtiquetas(input.value);
      input.value = "";
    }
  });
  $("#campo-etiquetas").addEventListener("click", (evento) => {
    if (evento.target.id === "campo-etiquetas" || evento.target.id === "lista-etiquetas") input.focus();
  });
}

// =====================================================================
// Formulario de prenda: abrir y guardar
// =====================================================================
async function abrirFormulario(id = null) {
  estado.form = { id, imagenes: [], etiquetas: [] };
  $("#form-prenda").reset();
  $("#prenda-visible").checked = true;
  $("#form-titulo").textContent = id ? "Editar prenda" : "Nueva prenda";
  mostrarError($("#form-error"), "");
  pintarOpcionesCategoria();
  $("#prenda-categoria").value = "";

  if (id) {
    try {
      const prenda = await api(`/api/admin/prendas/${id}`);
      $("#prenda-nombre").value = prenda.nombre;
      $("#prenda-tipo").value = prenda.tipo;
      $("#prenda-categoria").value = prenda.categoria_id ? String(prenda.categoria_id) : "";
      $("#prenda-descripcion").value = prenda.descripcion || "";
      $("#prenda-visible").checked = prenda.visible;
      estado.form.etiquetas = [...prenda.etiquetas];
      estado.form.imagenes = prenda.imagenes.map((imagen) => ({
        clave: ++contadorImagenes,
        public_id: imagen.public_id,
        vistaPrevia: urlCloudinary(imagen.url, TAMANOS.miniatura),
        estado: "listo",
        progreso: 100,
      }));
    } catch (e) {
      avisar(e.message, "error");
      return;
    }
  }
  pintarImagenes();
  pintarEtiquetas();
  modalForm.show();
}

async function guardarPrenda(evento) {
  evento.preventDefault();
  const error = $("#form-error");
  const pendiente = $("#input-etiqueta").value;
  if (pendiente.trim()) {
    agregarEtiquetas(pendiente);
    $("#input-etiqueta").value = "";
  }

  const { imagenes } = estado.form;
  const nombre = $("#prenda-nombre").value.trim();
  if (imagenes.some((i) => i.estado === "subiendo")) return mostrarError(error, "Espera a que terminen de subir las fotos.");
  const listas = imagenes.filter((i) => i.estado === "listo");
  if (!listas.length) return mostrarError(error, "Agrega al menos una foto.");
  if (nombre.length < 2) {
    $("#prenda-nombre").focus();
    return mostrarError(error, "Escribe el nombre de la prenda.");
  }

  const datos = {
    nombre,
    tipo: $("#prenda-tipo").value,
    categoria_id: $("#prenda-categoria").value ? Number($("#prenda-categoria").value) : null,
    descripcion: $("#prenda-descripcion").value.trim() || null,
    visible: $("#prenda-visible").checked,
    etiquetas: estado.form.etiquetas,
    imagenes: listas.map((i) => i.public_id),
  };

  const boton = $("#boton-guardar");
  boton.disabled = true;
  boton.textContent = "Guardando…";
  mostrarError(error, "");
  try {
    const { id } = estado.form;
    await api(id ? `/api/admin/prendas/${id}` : "/api/admin/prendas", { metodo: id ? "PUT" : "POST", datos });
    modalForm.hide();
    avisar(id ? "Prenda actualizada" : "Prenda guardada");
    cargarPrendas(true);
  } catch (e) {
    mostrarError(error, e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar prenda";
  }
}

// =====================================================================
// Inicio
// =====================================================================
function conectarEventos() {
  $("#form-login").addEventListener("submit", iniciarSesion);
  $("#boton-salir").addEventListener("click", cerrarSesion);

  $("#buscar-prendas").addEventListener(
    "input",
    debounce((evento) => {
      estado.prendas.texto = evento.target.value.trim();
      cargarPrendas(true);
    }, 350),
  );
  $("#prendas-mas").addEventListener("click", () => {
    estado.prendas.pagina += 1;
    cargarPrendas(false);
  });
  $("#boton-nueva").addEventListener("click", () => abrirFormulario());

  $("#input-fotos").addEventListener("change", (evento) => {
    agregarArchivos([...evento.target.files]);
    evento.target.value = "";
  });
  $("#form-prenda").addEventListener("submit", guardarPrenda);
  $("#modal-form").addEventListener("hidden.bs.modal", () => {
    estado.form.imagenes.forEach((i) => i.vistaPrevia.startsWith("blob:") && URL.revokeObjectURL(i.vistaPrevia));
  });
  conectarCampoEtiquetas();

  $("#form-categoria").addEventListener("submit", guardarCategoria);
  $("#categoria-cancelar").addEventListener("click", limpiarFormCategoria);
}

async function iniciar() {
  conectarEventos();
  const servidorListo = prepararServidor();

  if (sesion.token) {
    try {
      await servidorListo;
      estado.admin = await api("/api/auth/yo");
      await mostrarPanel();
      return;
    } catch {
      sesion.cerrar();
    }
  }
  mostrarLogin();
}

iniciar();
