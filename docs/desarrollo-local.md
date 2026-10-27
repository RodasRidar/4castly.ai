# Desarrollo local de punta a punta

Todo corre en tu máquina: Supabase (Auth, Storage, Postgres y correo), la API, el worker con el pronóstico
(TimesFM 3.0) y la web. Lo único que sale de tu máquina es la llamada a la API de Anthropic (chat y
propuesta de mapeo), porque ese modelo no es local.

Estado verificado el 2026-10-27 con un Kardex/ventas sintético: login por código, subida a Storage,
digest, confirmación del plan, pronóstico con TimesFM 3.0 (`forecasts.model = timesfm-3.0-mlx`),
resultados y chat con el modelo real. La web contra esta API **todavía no** se probó en navegador.

## Puertos

| Pieza | Puerto | Cómo se levanta |
|---|---|---|
| API (FastAPI) | 8000 | `make dev-api` |
| Web (Vite) | 5173 | `make dev-web` |
| Supabase Auth / Storage / REST | 54321 | `make local-up` |
| Postgres | 54322 | `make local-up` |
| Correo de pruebas (Mailpit) | 54324 | `make local-up` |
| Worker | sin puerto | la API lo lanza como subproceso por cada job |

Abrí la web como `http://localhost:5173` (no `127.0.0.1`): la API solo acepta ese origen por CORS.

## Primera vez

Requisitos: `brew install colima docker supabase uv pnpm` y Node. No hace falta Docker Desktop.

```bash
make local-up        # arranca Colima (4 CPU, 4 GB) y Supabase sin los servicios que no usamos
```

Crear los logins de los roles de base de datos (solo local; las contraseñas son `local`):

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -c "alter role app_api login password 'local'; alter role app_worker login password 'local';"
```

Crear los tres archivos `.env.local` (están en `.gitignore` y pisan a `.env`, que apunta al proyecto
hospedado). Las claves salen de `supabase status -o env`:

| Archivo | Variables |
|---|---|
| `apps/api/.env.local` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL=postgresql://app_api:local@127.0.0.1:54322/postgres`, `PROVISION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `JOB_RUNNER=local`, `ENVIRONMENT=local` |
| `apps/worker/.env.local` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL=postgresql://app_worker:local@127.0.0.1:54322/postgres`, `FORECASTER=timesfm`, `ENVIRONMENT=local` |
| `apps/web/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=http://localhost:8000`, `VITE_USE_MOCK=0` |

`ANTHROPIC_API_KEY` se lee de `apps/api/.env`; sin clave el chat responde 503 y el digest usa el matcher
determinista. Langfuse es opcional (`LANGFUSE_*`).

Crear un usuario y un tenant de prueba:

```bash
cd apps/api
PROVISION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  uv run python -m api.provisioning --tenant "Demo Local" --email dev@local.test --name "Dev Local"
```

## Día a día

```bash
make local-up        # si Colima/Supabase no están corriendo
make dev-api         # terminal 1: API en :8000
make dev-web         # terminal 2: web en :5173
make local-down      # al terminar: libera la RAM de la VM
```

**Login:** en la web pedí el código con `dev@local.test`; el correo llega a Mailpit
(`http://127.0.0.1:54324`). Supabase deja pedir un código por dirección cada 30 s (S2).

## Cómo se ejecuta el modelo (worker) en local

- Con `JOB_RUNNER=local` la API, al crear un job, lanza
  `uv run --project apps/worker python -m worker.local run <digest|forecast> <job_id>` como subproceso
  separado (no espera a que termine). Es el mismo código que ejecutan las funciones de Modal, sobre la
  misma fila de `jobs`.
- La salida de cada job queda en `apps/worker/.logs/worker-<tipo>-<job_id>.log`.
- Para reintentar a mano un job: `cd apps/worker && uv run python -m worker.local run forecast <job_id>`.
- `FORECASTER=timesfm` carga TimesFM 3.0 (MLX, Apple Silicon) al arrancar el worker y falla de inmediato si
  no está instalado (`cd apps/worker && uv sync --group local`). Los pesos están en
  `~/.cache/huggingface`. **Los pesos son no comerciales**: el worker se niega a usar TimesFM si
  `ENVIRONMENT` no es `local`. En dev y producción se usa AutoETS (`FORECASTER=autoets`, el valor por defecto).
- Con `JOB_RUNNER=modal` (el valor por defecto) la API llama a las funciones desplegadas en Modal.

## Qué se encontró al probarlo contra servicios reales

| Hallazgo | Estado |
|---|---|
| Supabase Storage se cuelga si un `Range` termina después del final del archivo | Corregido: se consulta el tamaño primero (`8eefe9f`). |
| Anthropic rechaza `minimum`/`maximum` en los schemas de tools con `strict` (400) | Corregido: el schema enviado no los lleva; Pydantic los sigue validando en el servidor. |
| En un turno de seguimiento el modelo reutilizaba ids de turnos anteriores o escribía el número él mismo | Corregido en el prompt: toda cifra sale de una tool llamada en el mismo turno. El guard enmascara lo que se escape. |
| El modelo agregaba la unidad después de una cifra ("0 sem semanas") | Corregido en el prompt: la referencia ya trae su unidad. |
| Sin columna de stock, todos los productos salen críticos con cobertura 0 | **Pendiente de decidir** (D17 en `decisiones-pendientes.md`). |

## Problemas conocidos

- `ty` avisa `unused-ignore-comment` en `timesfm_forecaster.py` si el grupo `local` está instalado en el
  entorno del worker (y falla `unresolved-import` si no lo está). Es un efecto del entorno, no del código.
- Si Colima se apagó: `colima start --cpu 4 --memory 4 --disk 20`, y después `make local-up`.
- Las claves de Supabase local son valores por defecto compartidos: no sirven ni deben usarse fuera de
  tu máquina.
