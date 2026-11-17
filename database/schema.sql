-- =====================================================================
-- Ink Fever · Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecútalo completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: puedes volver a correrlo sin romper nada.
-- =====================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Utilidad: mantener "actualizado_en" al día
-- ---------------------------------------------------------------------
create or replace function fn_actualizar_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Categorías que aparecen en el carrusel (Jordan, Marvel, etc.)
create table if not exists categorias (
  id         bigint generated always as identity primary key,
  nombre     varchar(60) not null unique,
  slug       varchar(70) not null unique
             check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  orden      smallint    not null default 0,
  activa     boolean     not null default true,
  creado_en  timestamptz not null default now()
);

create table if not exists prendas (
  id             bigint generated always as identity primary key,
  nombre         varchar(120)  not null,
  descripcion    varchar(1000),
  tipo           varchar(20)   not null check (tipo in ('playera', 'sudadera')),
  categoria_id   bigint        references categorias (id) on delete set null,
  visible        boolean       not null default true,
  creado_en      timestamptz   not null default now(),
  actualizado_en timestamptz   not null default now()
);

create index if not exists ix_prendas_categoria     on prendas (categoria_id);
create index if not exists ix_prendas_visible_fecha on prendas (visible, creado_en desc);

drop trigger if exists trg_prendas_actualizado on prendas;
create trigger trg_prendas_actualizado
  before update on prendas
  for each row execute function fn_actualizar_timestamp();

-- Fotos de cada prenda. La de orden 0 es la principal.
-- Solo guardamos la referencia; el archivo vive en Cloudinary.
create table if not exists imagenes_prenda (
  id         bigint generated always as identity primary key,
  prenda_id  bigint       not null references prendas (id) on delete cascade,
  public_id  varchar(255) not null unique,
  url        text         not null,
  orden      smallint     not null default 0,
  creado_en  timestamptz  not null default now(),
  unique (prenda_id, orden)
);

-- Etiquetas normalizadas: minúsculas, sin acentos, sin espacios extra.
create table if not exists etiquetas (
  id      bigint generated always as identity primary key,
  nombre  varchar(40) not null unique
          check (nombre = lower(btrim(nombre)) and nombre <> '')
);

create table if not exists prenda_etiqueta (
  prenda_id    bigint not null references prendas (id)   on delete cascade,
  etiqueta_id  bigint not null references etiquetas (id) on delete cascade,
  primary key (prenda_id, etiqueta_id)
);

create index if not exists ix_prenda_etiqueta_etiqueta on prenda_etiqueta (etiqueta_id);

-- Solo la API de FastAPI lee esta tabla. El público nunca tiene acceso.
create table if not exists administradores (
  id             bigint generated always as identity primary key,
  email          varchar(255) not null unique check (email = lower(email)),
  nombre         varchar(80)  not null,
  password_hash  text         not null,
  activo         boolean      not null default true,
  creado_en      timestamptz  not null default now()
);

-- ---------------------------------------------------------------------
-- Seguridad (RLS): el público SOLO puede leer lo visible
-- ---------------------------------------------------------------------
alter table categorias      enable row level security;
alter table prendas         enable row level security;
alter table imagenes_prenda enable row level security;
alter table etiquetas       enable row level security;
alter table prenda_etiqueta enable row level security;
alter table administradores enable row level security;  -- sin políticas = nadie entra por la API pública

-- Defensa extra: el público no puede escribir aunque alguien agregue una política por error.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on administradores from anon, authenticated;

drop policy if exists lectura_publica on categorias;
create policy lectura_publica on categorias
  for select to anon, authenticated
  using (activa);

drop policy if exists lectura_publica on prendas;
create policy lectura_publica on prendas
  for select to anon, authenticated
  using (visible);

drop policy if exists lectura_publica on imagenes_prenda;
create policy lectura_publica on imagenes_prenda
  for select to anon, authenticated
  using (exists (select 1 from prendas p where p.id = prenda_id and p.visible));

drop policy if exists lectura_publica on etiquetas;
create policy lectura_publica on etiquetas
  for select to anon, authenticated
  using (true);

drop policy if exists lectura_publica on prenda_etiqueta;
create policy lectura_publica on prenda_etiqueta
  for select to anon, authenticated
  using (exists (select 1 from prendas p where p.id = prenda_id and p.visible));

-- ---------------------------------------------------------------------
-- Vista del catálogo: una fila por prenda con categoría, etiquetas e imágenes.
-- security_invoker = true hace que respete las reglas RLS de arriba.
-- ---------------------------------------------------------------------
create or replace view v_catalogo
with (security_invoker = true)
as
select
  p.id,
  p.nombre,
  p.descripcion,
  p.tipo,
  p.visible,
  p.creado_en,
  c.id     as categoria_id,
  c.nombre as categoria,
  c.slug   as categoria_slug,
  coalesce(et.etiquetas, '{}')       as etiquetas,
  coalesce(im.imagenes, '[]'::json)  as imagenes
from prendas p
left join categorias c on c.id = p.categoria_id
left join lateral (
  select array_agg(e.nombre::text order by e.nombre) as etiquetas
  from prenda_etiqueta pe
  join etiquetas e on e.id = pe.etiqueta_id
  where pe.prenda_id = p.id
) et on true
left join lateral (
  select json_agg(json_build_object('public_id', i.public_id, 'url', i.url) order by i.orden) as imagenes
  from imagenes_prenda i
  where i.prenda_id = p.id
) im on true;

-- ---------------------------------------------------------------------
-- Búsqueda: cada palabra escrita debe aparecer en el nombre o en alguna etiqueta.
-- "goku negra" encuentra prendas que tengan "goku" Y "negra". Ignora acentos.
-- ---------------------------------------------------------------------
create or replace function buscar_prendas(
  p_texto     text default null,
  p_categoria text default null,
  p_tipo      text default null,
  p_limite    int  default 24,
  p_offset    int  default 0
)
returns setof v_catalogo
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select v.*
  from v_catalogo v
  where (p_categoria is null or v.categoria_slug = p_categoria)
    and (p_tipo is null or v.tipo = p_tipo)
    and (
      coalesce(btrim(p_texto), '') = ''
      or not exists (
        select 1
        from regexp_split_to_table(extensions.unaccent(lower(btrim(p_texto))), '\s+') as palabra
        where not (
          extensions.unaccent(lower(v.nombre)) like '%' || palabra || '%'
          or exists (select 1 from unnest(v.etiquetas) as t where t like '%' || palabra || '%')
        )
      )
    )
  order by v.creado_en desc, v.id desc
  limit least(greatest(p_limite, 1), 60)
  offset greatest(p_offset, 0);
$$;

grant usage on schema extensions to anon, authenticated;  -- para usar unaccent()
grant select on v_catalogo to anon, authenticated;
grant execute on function buscar_prendas(text, text, text, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into categorias (nombre, slug, orden) values
  ('Jordan',      'jordan',      1),
  ('Nickelodeon', 'nickelodeon', 2),
  ('Dragon Ball', 'dragon-ball', 3),
  ('Marvel',      'marvel',      4)
on conflict (nombre) do nothing;
