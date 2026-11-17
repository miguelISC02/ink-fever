# Ink Fever

Landing para mostrar los diseños de playeras y sudaderas de Ink Fever, con panel de administración.

## Arquitectura (híbrida)

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| Landing pública (`frontend/`) | Render, sitio estático | Lee las prendas **directo de Supabase** (solo lectura, carga al instante) |
| Panel admin (`frontend/admin/`) | Render, sitio estático | Habla con la API de FastAPI |
| API (`backend/`) | Render, web service (Python) | Login, firma de subidas, crear/editar/borrar prendas |
| Base de datos (`database/`) | Supabase (PostgreSQL) | Prendas, categorías, etiquetas, admins |
| Imágenes | Cloudinary | Guarda y optimiza las fotos |

**Seguridad:** el público solo puede *leer* prendas visibles (reglas RLS en PostgreSQL).
Escribir solo es posible a través de FastAPI, que guarda los secretos en el servidor.

```
ink-fever/
├── database/
│   └── schema.sql            # Tablas, seguridad, vista del catálogo y búsqueda
├── backend/
│   ├── app/
│   │   ├── main.py           # Arranque de FastAPI, CORS y rutas
│   │   ├── config.py         # Variables de entorno
│   │   ├── security.py       # Contraseñas (bcrypt) y tokens (JWT)
│   │   ├── deps.py           # Conexión a BD y verificación del admin
│   │   ├── schemas.py        # Validación de datos (Pydantic)
│   │   ├── texto.py          # Normalizar etiquetas y slugs
│   │   ├── routers/          # Endpoints: auth, categorías, prendas, utilidades
│   │   └── services/         # Cloudinary
│   ├── scripts/crear_admin.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html            # Landing pública
    ├── admin/index.html      # Panel de administración
    ├── css/                  # base.css (compartido), landing.css, admin.css
    ├── js/
    │   ├── config.js         # ← AQUÍ pones tus URLs, llave pública, WhatsApp e Instagram
    │   ├── catalogo.js       # Lectura pública desde Supabase
    │   ├── landing.js        # Galería, búsqueda, carrusel y detalle
    │   ├── utils.js          # Utilidades compartidas
    │   └── admin/            # api.js, subidas.js, panel.js
    └── img/favicon.svg
```

---

## 1. Supabase (base de datos)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega todo `database/schema.sql` y presiona **Run**.
3. Copia la cadena de conexión: botón **Connect → Connection string → Session pooler**.
   Úsala como `DATABASE_URL` (reemplaza `[YOUR-PASSWORD]` por la contraseña del proyecto).
4. Para el frontend vas a necesitar, en **Project Settings → API**: la *Project URL* y la llave pública
   (*anon / publishable key*). **Nunca** uses la `service_role` en el navegador.

## 2. Cloudinary (imágenes)

1. Crea una cuenta gratis en [cloudinary.com](https://cloudinary.com).
2. En **Settings → API Keys** copia *Cloud name*, *API Key* y *API Secret*.

## 3. Correr la API en tu computadora

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # y llena tus valores
python -m scripts.crear_admin   # crea tu usuario de administrador

uvicorn app.main:app --reload
```

Abre <http://127.0.0.1:8000/api/docs> para ver y probar todos los endpoints
(botón **Authorize** después de hacer login).

## 4. Desplegar la API en Render

**New → Web Service**, conecta tu repositorio y configura:

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Runtime | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"` |
| Health Check Path | `/api/salud` |

En **Environment** agrega las mismas variables de tu `.env`, más `PYTHON_VERSION=3.12.8`.
En producción usa `MOSTRAR_DOCS=false` y pon en `CORS_ORIGENES` la URL real de tu sitio, por ejemplo
`["https://ink-fever.onrender.com"]`.

> El plan gratuito de Render "duerme" la API tras 15 minutos sin uso. Solo afecta al panel admin
> (tarda unos segundos en despertar); la landing no depende de la API.

## 5. Frontend en tu computadora

1. Edita `frontend/js/config.js` con la URL y la llave pública de Supabase, la URL de tu API,
   tu WhatsApp (52 + 10 dígitos, sin espacios) y tu usuario de Instagram.
2. Ábrelo con un servidor local, **no con doble clic** (los módulos de JavaScript no funcionan con `file://`):
   - VS Code: extensión **Live Server** → clic derecho en `index.html` → *Open with Live Server* (puerto 5500).
   - O en la terminal: `cd frontend && python -m http.server 5500`
3. Landing: <http://127.0.0.1:5500> · Panel: <http://127.0.0.1:5500/admin/>

## 6. Desplegar el frontend en Render

**New → Static Site**, mismo repositorio:

| Campo | Valor |
|---|---|
| Root Directory | `frontend` |
| Build Command | *(vacío)* |
| Publish Directory | `.` |

Después, en la API de Render, agrega la URL del sitio a `CORS_ORIGENES` y cambia `apiUrl` en `config.js`
por la URL de la API en Render.

> Si quitas una foto **antes** de guardar una prenda nueva, esa foto ya quedó subida en Cloudinary.
> Ocupa muy poco, pero puedes borrarla desde la Media Library de Cloudinary (carpeta `ink-fever`).

---

## Endpoints

Todos los de `/api/admin/*` requieren el header `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/salud` | Revisa que la API esté despierta |
| POST | `/api/auth/login` | Inicia sesión, devuelve el token |
| GET | `/api/auth/yo` | Datos del admin con sesión activa |
| GET | `/api/admin/prendas?texto=&categoria=&tipo=&pagina=` | Lista y busca (incluye ocultas) |
| GET | `/api/admin/prendas/{id}` | Una prenda |
| POST | `/api/admin/prendas` | Crea prenda |
| PUT | `/api/admin/prendas/{id}` | Edita prenda (imágenes quitadas se borran de Cloudinary) |
| PATCH | `/api/admin/prendas/{id}/visible` | Mostrar u ocultar |
| DELETE | `/api/admin/prendas/{id}` | Borra prenda y sus imágenes |
| GET/POST | `/api/admin/categorias` | Lista / crea categorías |
| PUT/DELETE | `/api/admin/categorias/{id}` | Edita / borra categoría |
| GET | `/api/admin/etiquetas?q=` | Autocompletado de etiquetas |
| POST | `/api/admin/cloudinary/firma` | Firma para subir una imagen |

### Flujo para subir una prenda

1. `POST /api/admin/cloudinary/firma` → recibes `url_subida` y `parametros`.
2. El navegador envía la imagen a `url_subida` como `multipart/form-data` con **todos** los `parametros`
   más el campo `file`. Cloudinary responde con el `public_id`.
3. `POST /api/admin/prendas` con los `public_id` en `imagenes` (la primera es la principal).
   La API confirma con Cloudinary que existen antes de guardarlas.

### Búsqueda

Cada palabra escrita debe aparecer en el nombre o en una etiqueta, sin importar acentos ni mayúsculas.
`goku negra` encuentra prendas que tengan "goku" **y** "negra".
La landing usa la misma función (`buscar_prendas`) directo desde Supabase.
