# 4Castly implementation plan (Phase 0: inventory)

Status: draft for review. No code written yet. Sources: repo at `b5cb58a`, `DESIGN.md`, Stitch project
`4castly.com` (id `9393302228849102473`, read-only), and the phased brief.

Written in English per `CLAUDE.md` ("all code, comments, docs ... in English"). The UI copy stays Spanish.

---

## 1. Current architecture

### Monorepo

| Path | Stack | State |
|---|---|---|
| `apps/web` | React 19, Vite 8, TypeScript 6, Recharts 3, supabase-js, oxlint | Vite starter: one `App.tsx`, one `ForecastChart`, mock data, starter `index.css` (purple accent, system fonts) |
| `apps/api` | FastAPI, pydantic-settings, supabase-py, uv | `create_app()` + CORS + `/health` only; lazy service-role Supabase client in `deps.py` |
| `apps/worker` | Python 3.12, Polars, Pandera, statsforecast, TimesFM, uv | Hexagonal: `domain/models.py` (Movement, DemandSeries, Forecast), ports (`Forecaster`, `MovementSource`, `ForecastRepository`), `application/cleaning.py`, adapters (Kardex Excel, statsforecast, TimesFM) |
| `supabase/migrations` | SQL | `0001_init.sql`: tenants, tenant_members, skus, movements, demand_series, forecast_jobs, forecasts, RLS select-only placeholders, pgmq queue |

Tooling: `make check` = oxlint + ruff + `tsc -b` + `ty` + pytest; prek hooks block client data; CI on GitHub Actions.
pnpm workspace contains only `apps/web`.

### Frontend gaps (nothing exists yet)

- Routing: none. Server state / data fetching: none. Client state: none.
- Styling: plain global CSS from the Vite template, no tokens, no theme switching, no Geist.
- Component library: none (only `ForecastChart`).
- i18n: none. Tests: no runner (`vitest` absent), no Testing Library.
- Services layer: only a nullable Supabase client.

### Backend gaps

- No auth, no upload, no jobs API, no chat, no LLM integration.
- Worker reads Kardex movements only; no generic tabular ingestion (the template "Fecha, Código de producto,
  Nombre de producto, Cantidad vendida, Stock").
- No inventory formulas (coverage, risk, suggested quantity, stock projection).
- Schema has no conversations, messages, uploads, mappings, run metrics, profiles or preferences.

---

## 2. Stitch inventory

28 visible frames read (HTML). ~30 hidden "Generating Screen..." frames ignored. `DESIGN-vercel.md` frame is the
design-system card.

| Frame | Screen id |
|---|---|
| 01-login | `96ec218ed3e24f03bd33757bbbbc697e` |
| 01b-login-correo-enviado | `5794ac6677264b948e26baeeb9244b03` |
| 01c-login-error | `28631456050f45b18924512e9fbb89e5` |
| 01d-login-no-habilitado | `f88e3cc4869448dfbea16ed2809df4ef` |
| 02-nuevo-forecast | `e5877aab35cb470ba2203ac3c48b5c1f` |
| 02-nuevo-forecast-drag-and-drop-hover | `6d6fc35ba5e74d73b9bd6d3f4ed900fa` |
| 02-nuevo-forecast-file-upload | `d05613410d594a678576ada48a170746` |
| 03-digestion | `9cbb24dcd324400586acef435e5c4fab` |
| 04-confirmacion | `626825778114455db6e9758ab103b529` |
| 04-confirmacion-edicion | `af6e6a42d97e4a23b53d1b3f1525ba19` |
| 04-confirmacion-confirmado | `01ffd0fa421d4e0aab47ec9104a3d48a` |
| 05-clarificacion | `8d0256590f6f418a954cb13b7b939ab6` |
| 05-clarificacion-respondio | `c8957614cd52434696dc4373887101df` |
| 05-clarificacion-calculando | `73158b42c2d148ac96f3a7513d4e3e53` |
| 06-resultados-chat | `26d8f8c0a7ec4191a9f01b465af5e5d4` |
| 06b-resultados-portafolio | `79ff6bcf38df491ab0e225d9f3695ca3` |
| 06b-resultados-portafolio-con-asistente-ia-abierto | `0529b5c675744e6fb8ba6a4803bcd92a` |
| 07-detalle-producto | `9b40a50b03ae4484a68b9bfaaeeed2c7` |
| 07b-con-compra-sugerida | `b0fa83f6124543728ffbe5b6442334bb` |
| 07c-preguntar | `36271792665f422cb5627773a963a15a` |
| 08a-error-archivo | `09c0a594fdb1428aa8f887bab4d068b2` |
| 08b-sin-fechas | `6b10c0a10e0547fea720b6f4feed7df9` |
| 08c-calculando | `4d1a0fcf0cee4ec1a2d1231f26ce6bc5` |
| 08d-fallo | `fdcea06874164838b4a6afd87532002f` |
| 08f-sin-resultados | `7ad341da1cfb4d00837e728ac394d5ba` |
| Configuración - Perfil | `84d26face0b24b7d97d13be629d705bc` |
| Configuración - Preferencias (hidden) | `691af86bb9e142d6957601f2b991e02f` |
| Menú de usuario abierto (hidden) | `91b8f79f886a425d8bd72e6d80104426` |

No frames exist for: full history list, conversation hover menu (rename/archive/delete), sidebar collapsed,
mobile layouts, dark theme, the parameters drawer open, ConfirmCard/Toast. These get built from the brief.

### 2.1 Frame → route → states

URL slugs are Spanish because they are user-visible (the brief uses `?vista=portafolio`); code identifiers stay English.

| Route | Frames | States |
|---|---|---|
| `/login` | 01, 01b, 01c, 01d | `idle`, `sending`, `invalid_email`, `code_sent` (6-digit code, 30 s resend, "Usar otro correo"), `code_invalid`. 01d merges into `code_sent`: the neutral copy "Si tu correo está habilitado, recibirás un enlace…" is shown for every valid-format email, so the UI never reveals whether an email is enabled |
| `/auth/callback` | none | magic-link landing → session → redirect |
| `/` | none | redirect to `/nuevo` |
| `/nuevo` | 02 ×3 | `empty`, `dragging` (whole window is the drop target, no layout shift), `attached`, `uploading`, `upload_error` |
| `/c/:conversationId` | 03, 04 ×3, 05 ×3, 08a, 08b, 08c, 08d | Conversation stage machine (below) |
| `/c/:conversationId?vista=portafolio` | 06b, 06b-drawer | Portfolio mode; chat folds into the "Preguntar" button + drawer |
| `/c/:conversationId` (stage `ready`) | 06, 08f, user menu | Chat 40 % + results 60 %; filters in URL (`q`, `riesgo`, `abc`, `pagina`, `orden`) |
| `/c/:conversationId/productos/:productCode` | 07, 07b, 07c | `?compra=sugerida` toggles the scenario; `?preguntar=1` opens the product-scoped chat drawer |
| `/historial` | none | full conversation list, search, empty state |
| `/configuracion/perfil` | Perfil | `pristine`, `dirty` (Descartar / Guardar), `saving`, `saved` (toast), leave-with-changes confirm |
| `/configuracion/preferencias` | Preferencias | theme, language, time zone; autosave |
| `/dev/tokens` | none | dev-only token/typography/control-state sheet (Phase 1) |

Conversation stage machine (`/c/:id`), driven by the backend, never inferred client-side:

```
uploaded → digesting ─┬→ unreadable (08a)
                      ├→ needs_date_column (08b)
                      └→ awaiting_confirmation (04, read-only | edit mode)
awaiting_confirmation → confirmed (04-confirmado)
confirmed → clarifying (05) → calculating (05-calculando, 08c) ─┬→ ready (06/06b)
                                                                └→ failed (08d)
any stage → cancelled (digestion "Cancelar")
```

Sidebar item state derives from the same stage: spinner for `digesting | calculating`, red dot for
`failed | unreadable`.

### 2.2 Functional inventory per area

**Auth (01x)**: email field, single primary "Enviarme un enlace de acceso", 6-digit code inputs, resend
countdown, "Usar otro correo", footer "© 2026 4Castly · Términos · Privacidad · Soporte".

**New forecast (02x)**: upload card 2/3 width + two "Próximamente" cards (Google Sheets, Base de datos),
dropzone, file chip (name truncated in the middle, size in mono, remove, "Cambiar archivo"), status line above
"Continuar", privacy line, "Descargar plantilla".

**Digestion (03)**: user file bubble, assistant message, 4-step stepper (Leyendo archivo, Identificando columnas,
Limpiando datos, Listo para pronosticar), locked composer, inline "Cancelar" (missing in the frame; from the brief).

**Confirmation (04x)**: summary ("Encontré 142 productos y 2 años y 9 meses de historia…"), mapping card with
sample values, sheet selector, data warnings ("3 productos tienen poco historial…"), "Sí, es correcto" +
"Corregir", edit mode with selects ("— No tengo esta columna —" on optional fields), collapsed
"✓ Datos confirmados · Ver detalle", three suggestion chips, composer unlocked only after confirmation.

**Clarification (05x)**: max two questions with single-select chips (lead time: 7 / 14 / 30 días / Otro;
stockouts: Sí / No / No lo sé, only when there is no stock column), "Calcular pronóstico" enabled when both are
answered, "Omitir y pronosticar ahora" (results must then show the defaults used), progress card
"87 de 142 productos" (indeterminate bar, no fake percentage).

**Results (06x, 08c, 08f)**: header "Proyecciones / [nombre] / Resultados", "Compartir enlace", "Exportar";
tabs "Chat + resultados" / "Portafolio"; focus chip "12 de 142 en foco · Restablecer"; accent-insensitive
search; Riesgo and Clase ABC filters; 3 KPI cards (Productos en riesgo, Cobertura promedio, Confiabilidad);
aggregate chart (history, expected, low/high range, past stockouts, "Hoy"); product table (Producto, Clase ABC,
Demanda típica, Stock actual, Cobertura, Riesgo; portfolio adds Cantidad sugerida, Comprar antes de, Tiempo de
reposición editable, multi-select, "Exportar selección", column picker); pagination; "Plan de compra sugerido";
chat with message actions (copy, retry, like, dislike), suggestion chips, figures in chat that link to filters;
parameters drawer (horizon 8/12/24 weeks, weekly/monthly, lead time, critical threshold, assistant style
Breve/Detallado, "Recalcular"); skeletons while calculating; empty state for no filter matches.

**Product detail (07x)**: back link, product title + code + ABC + risk + "Datos hasta", three cards
(stock runs out on…, purchase recommendation with editable lead time and target coverage, reliability in
business language with "Ver detalle técnico"), chart (history, expected, low/high range, projected stock,
past stockout zones, "Hoy", purchase arrival), weekly table (Semana, Escenario bajo / esperado / alto, Stock
proyectado, Faltante, Estado) with "Sin nueva compra / Con compra sugerida", "Exportar producto",
"Preguntar sobre este producto" (drawer with product context and suggested questions).

**Errors (08x)**: unreadable file (password-protected or corrupt) + "Subir otro archivo"; no date column with a
listbox of plausible columns and samples + "Mi archivo no tiene fechas"; failure with human copy, short support
reference, "Reintentar", "Contactar soporte".

**Shell**: sidebar (logo "4C" + "4Castly", collapse, "Nuevo forecast" secondary, groups Fijados / Hoy /
Esta semana / Antes, "Ver todo el historial", user card), user menu popover (name, email, company,
Configuración, Tema, Idioma, Cerrar sesión in red).

**Settings**: side nav ("← Volver a la aplicación", Perfil, Preferencias, Próximamente: Empresa y equipo,
Fuentes de datos, Notificaciones, Plan y uso); profile (Nombre and Cargo editable, Correo and Empresa read-only);
preferences (Tema, Idioma with the assistant-language note, Zona horaria).

### 2.3 Frame violations to drop during implementation

| Violation | Frames |
|---|---|
| Top bar / breadcrumb row on chat screens | 06, 06b, 08c, 08f, user menu (the results header with breadcrumb + actions is kept as a header of the results panel, not a global top bar; confirm in D9) |
| Blue (#0070f3 file icon; #0284c7, #0f172a, #38bdf8 purchase line and callout) | 04-edición, 07b |
| More than one black primary | 06 / 06b ("Exportar plan de compra" + black active tab), 07 ("Preguntar sobre este producto"), 05-respondió (selected chips; selection state, not a button: acceptable) |
| Assistant/model names: "Aura Forecast", "Aura Asistente", "Geist AI Core", "Asistente IA" | 06, 06b, 07c |
| Version badges "v2.4", "UTF-8" in export menu | 06, 06b, settings |
| Jargon: "Banda de confianza", "Confidence Interval" | 06, 07 |
| "SKU" in user copy ("12 SKUs", "Detalle de SKU", "Buscar por SKU", "Haz una pregunta sobre este SKU") | 06, 06b, 07, 07c |
| Invented numbers: 70 % progress bar, "33 % Crítico" 33/45/22 bar, "18 %" increase, "-1.8 sem vs. histórico" | 05-calculando, 06b-drawer, 07 hidden chat, 06 |
| Undecided limits/promises: "hasta 3 años de historial", ".parquet", "El enlace caduca en 1 hora" (only if we confirm the TTL) | 02, 08a, 01b |
| English time format "10:42 AM"; week codes "S44", "S02 '27" | 05, 06, 06b-drawer, user menu |
| Inconsistent sample data: "Minera Andes", "Corrida #FST-8842", finance titles "Capex expansión planta", "Proyección divisas USD/CLP", emails | most |
| Arithmetic that does not add up: +1,355 u arrival but peak stock 1,025 u; stock 0 with shortfall 0 | 07b |
| Three sidebar widths (240 / 256 / 260 px) and three logos | all app frames → unify at 260 px, "4C" + "4Castly" |
| Duplicated legal links (01d), duplicated "Enter para enviar" (08d), duplicated breadcrumb text (06) | 01d, 08d, 06 |
| Dead countdown code (ids missing) | 01b |

Sample data will be replaced by one coherent example tenant (an importer of chemical/pharma inputs, matching
the first client's domain) generated from the formulas module (section 6).

---

## 3. Design tokens and contradictions

Stitch theme: Geist / Geist Mono, primary overridden to #171717, roundness 4, light only. Its embedded design MD
is the same Vercel analysis as `DESIGN.md` but with Material-generated surfaces (#fdf8f8 background, #000 primary).

`DESIGN.md` (repo) defines: ink #171717, body #4d4d4d, mute #8f8f8f, faint #a1a1a1, hairline #ebebeb,
hairline-soft #f2f2f2, canvas #fafafa, elevated #fff, error #ee0000 / #c50000, warning #f5a623 / soft #ffefcf /
deep #ab570a, link blue #0070f3, decorative violet/cyan/pink/magenta and gradients; radii 6 / 12 / 16 / 64 /
100 px; 4 px spacing scale; elevation 0/1/2; Geist type scale.

### Contradictions

| # | Topic | DESIGN.md | Brief override rules | Frames | Proposal |
|---|---|---|---|---|---|
| C1 | Links | Blue #0070f3 | #171717 with thin underline, no blue | Mostly #171717 | Override wins |
| C2 | Success / positive | "Success maps to link blue" | Green only for status; "Óptimo" is green | Emerald #10b981 / #065f46 | Add a green token (not in DESIGN.md) |
| C3 | Focus ring | Link blue | No blue | n/a | Ink focus ring (2 px #171717, offset 2 px) |
| C4 | Buttons shape | Marketing pills (100 px) vs app 6 px | n/a | App 6 px; chips pill | App controls 6 px; chips pill; no marketing pills |
| C5 | Decorative gradients and accents | Hero mesh gradient, violet/cyan/pink | Red/amber/green only for status | Unused | Drop from app tokens |
| C6 | Dark theme | Not defined | Required | Not drawn | Derive dark tokens (D3) |
| C7 | Shadows | Level 1 whisper on cards | Shadows only on popovers | Mixed | Cards flat (hairline only); level 2 for popovers/drawers/menus |
| C8 | Primary | #171717 | Black | #000 and #171717 mixed | #171717 |
| C9 | Mono usage | Code + uppercase eyebrows | Mono only for numbers and file metadata | Eyebrows in 05 | No mono eyebrows; section labels in Geist |
| C10 | Corrupted line | `DESIGN.md:60` contains stray non-English text inside `label-sm.fontWeight` (`500 burada komikledin mi…`), which breaks the YAML front matter | n/a | n/a | Treat value as 500; fix the file (needs your OK) |

**Resolution (D2, decided 2026-10-23): Stitch wins over `DESIGN.md`.** Precedence is now:

1. The brief's override rules (no blue, one primary, status colors only for risk, no jargon, no invented data).
   They were written to override any frame, so the violations in 2.3 are still fixed.
2. The Stitch project (theme + what the frames render).
3. `DESIGN.md`, only for what Stitch does not define (type scale, spacing scale, elevation levels).
4. `CLAUDE.md` and the repo conventions for code.

`DESIGN.md` stays untouched (including the corrupted line 60); it is no longer the token source.

Tokens taken from Stitch (theme + the values the frames hard-code):

| Token | Light | Source |
|---|---|---|
| `ink` / `primary` | #171717 | Stitch primary override, frames |
| `body` | #4d4d4d | frames |
| `mute` | #8f8f8f | frames |
| `faint` | #a1a1a1 | frames |
| `hairline` | #ebebeb | frames |
| `canvas` | #fafafa | frames (sidebar, page) |
| `elevated` | #ffffff | frames (cards) |
| `selected` | #f4f4f5 | frames (active conversation) |
| `critical` fg / bg / border | #ee0000 / #fef2f2 / #fca5a5 | frames 06 |
| `medium` fg / accent / bg / border | #ab570a / #f5a623 / #fffbeb / #fed7aa | frames 06 |
| `optimal` fg / accent / bg / border | #065f46 / #10b981 / #ecfdf5 / #a7f3d0 | frames 06 |
| Radius | 2 / 4 / 6 / 8 / 12 px, full for chips and avatars | Stitch `ROUND_FOUR` scale (sm / default / md / lg / xl) |
| Fonts | Geist, Geist Mono | Stitch theme |
| Type scale | display-xl 48, heading-lg 32, heading-md 20, label-sm 14/500, body-lg 16, body-md 14, body-sm 12, code 14 mono | Stitch theme (same as `DESIGN.md`) |
| Spacing | 4 px grid: 4, 8, 12, 16, 24, 32, 40, 64, 96 | Stitch theme |

Brief rules that still adjust the frames: links are ink with a thin underline, focus ring is ink (2 px, offset
2 px), no `link` blue token at all, cards are flat (hairline only), shadows only on popovers, drawers and menus,
no mono eyebrows. Dark values are derived (D3) and checked for 4.5:1 contrast.

---

## 4. Backend decision: FastAPI or NestJS (D1, decided 2026-10-23: FastAPI)

Question: since this is a monorepo with shared contracts, should the SaaS backend be NestJS, with Python only
where needed?

Decision: keep FastAPI. Reasons, from this repo:

1. "Where Python is needed" is most of the backend. Kardex parsing, file profiling, executing the normalization
   plan, cleaning, forecasting, the inventory formulas (projection, coverage, risk, suggested quantity), the
   product what-if recalculation and the Excel export all run on Polars/Pandera/statsforecast/TimesFM. What NestJS
   would own is auth (already Supabase Auth), CRUD (largely covered by Supabase + RLS) and chat proxying.
2. Shared contracts do not require a shared language. FastAPI emits OpenAPI from Pydantic; `openapi-typescript`
   turns it into TS types in one command, checked in CI for drift. With NestJS the TS↔TS contract becomes free,
   but the Nest↔worker contract (jobs, normalization plan, run results) becomes a hand-maintained cross-language
   contract, which is the riskier seam.
3. One formulas module. The brief requires the formulas in a single tested module. With Python owning numbers,
   that module lives in the worker domain and the API reuses it. With NestJS the what-if steppers on the product
   page push you to reimplement the formulas in TS.
4. Cost of two runtimes: two auth integrations, two validation layers, two test stacks, two deploy targets, two
   sets of DB access code for the same tables, for a team of one.

When NestJS would win: a large TS-only team, or heavy realtime/collaboration features with little numeric logic.
Neither applies today.

Shared-contract mechanics with FastAPI:

- Pydantic schemas in `apps/api/src/api/schemas/` are the source of truth.
- `make contracts` exports `openapi.json` and generates `apps/web/src/services/http/schema.gen.ts`.
- CI fails if the generated file differs from the committed one.
- The worker exposes no HTTP; API and worker share the DB and the queue. Formulas live in the worker's pure
  domain, and the API depends on that module through a uv workspace (pure module only, no heavy imports).

---

## 5. Data model (proposal, migration `0002`)

Existing tables are kept. Changes are additive except D4 (rename `skus` → `products`; no production data yet).

| Table | Purpose | Key columns |
|---|---|---|
| `tenants` (exists) | Company | `name` |
| `tenant_members` (exists) | Membership + role | |
| `allowed_emails` | Login allowlist per tenant | `tenant_id`, `email` (citext, unique), `invited_at` |
| `profiles` | User profile + preferences | `user_id` PK, `full_name`, `job_title` null, `theme` (`light|dark|system`), `locale` (`es|en`), `time_zone`, `assistant_style` (`brief|detailed`) |
| `conversations` | One forecast thread (sidebar item) | `tenant_id`, `created_by`, `title`, `pinned_at`, `archived_at`, `deleted_at` (soft delete for undo), `stage` (enum from 2.1), `last_activity_at` |
| `uploads` | Uploaded file | `conversation_id`, `storage_path` (Supabase Storage, private bucket), `file_name`, `size_bytes`, `content_type`, `sheets` text[], `selected_sheet`, `profile` jsonb (columns, types, date range, sample), `status`, `error_code` |
| `normalization_plans` | LLM-proposed then user-confirmed mapping | `upload_id`, `plan` jsonb (versioned schema), `proposed_by` (`llm|user`), `confirmed_at`, `confirmed_by` |
| `jobs` (replaces `forecast_jobs`, D5) | Digestion and forecast jobs | `kind` (`digest|forecast`), `conversation_id`, `status`, `stage`, `processed`, `total`, `error_ref` (short support code), `params` jsonb, timestamps |
| `job_events` | Real stage transitions for the stepper | `job_id`, `stage`, `at` |
| `products` (rename of `skus`) | Product catalog | `code`, `name`, `uom` |
| `sales` | Normalized demand rows from generic files | `tenant_id`, `upload_id`, `product_id`, `date`, `qty`, `stock` null |
| `movements` (exists) | Kardex movements | |
| `demand_series` (exists) | Cleaned series | add `upload_id` |
| `forecast_runs` | One calculation result per conversation version | `conversation_id`, `job_id`, `data_until`, `horizon_weeks`, `granularity`, `params` jsonb (lead time, risk threshold, defaults_used bool), `created_at` |
| `forecasts` (exists) | Per product × period scenarios | add `run_id`; keep `p10/p50/p90` columns internally (jargon is banned in the UI only); `model` stays internal |
| `run_product_metrics` | Precomputed table row per product | `run_id`, `product_id`, `abc_class`, `typical_weekly_demand`, `current_stock`, `coverage_weeks_low/high`, `risk`, `stockout_date`, `suggested_qty_low/high`, `buy_before`, `reliability` (`high|medium|low`), `reliability_detail` jsonb |
| `product_overrides` | Per-tenant lead time / target coverage | `tenant_id`, `product_id`, `lead_time_days`, `target_coverage_weeks`, `on_order_qty` |
| `messages` | Chat | `conversation_id`, `role` (`user|assistant`), `kind` (`text|file|mapping|clarification|progress|result|error`), `content`, `payload` jsonb, `context_product_id` null, `created_at` |
| `message_feedback` | Like / dislike | `message_id`, `user_id`, `value` (`up|down`) |
| `share_links` | "Compartir enlace" | `conversation_id`, `token`, `scope` (D10), `expires_at` |

| `audit.log_entries` | Row-change audit (append-only) | `id`, `at`, `tenant_id`, `actor_id`, `request_id`, `table_name`, `op` (`INSERT|UPDATE|DELETE`), `row_pk`, `old` jsonb, `new` jsonb, `changed_fields` text[] |
| `audit.events` | Business audit events | `at`, `tenant_id`, `actor_id`, `request_id`, `action` (`auth.login`, `upload.created`, `plan.confirmed`, `run.recalculated`, `export.created`, `share.created`, `conversation.deleted`, `assistant.feedback`), `target_type`, `target_id`, `metadata` jsonb |

### Multi-tenancy

Shared schema, `tenant_id` on every domain row, enforced by RLS (pool model). This is the model the repo already
started; schema-per-tenant or database-per-tenant are not justified for B2B with a few dozen companies.

- Every policy goes through `current_tenant_ids()` (already `SECURITY DEFINER`, so no recursive policies).
- Composite foreign keys `(tenant_id, id)` on child tables so a row can never point to another tenant's parent.
- RLS also applies to the API, not only to the browser. The API connects with a dedicated `app_api` role
  (no `BYPASSRLS`) and, per request transaction, runs `set local role authenticated` plus
  `set_config('request.jwt.claims', <verified claims>, true)` and `set_config('app.request_id', <id>, true)`.
  `auth.uid()`, RLS and the audit triggers then see the real user. A bug in a query cannot leak another tenant.
- The worker uses a separate `app_worker` role that may bypass RLS, and every worker query takes an explicit
  `tenant_id` (the job carries it).
- RLS tests: pytest suite that seeds two tenants and asserts each table returns zero rows across tenants.

### Auditing

- One generic trigger function `audit.record_change()` attached to every mutable domain table. It stores the old
  and new row, the changed fields, `auth.uid()` as actor and `current_setting('app.request_id', true)`, so each
  DB change joins to the request logs and traces in Axiom by `request_id`.
- `audit` schema: `insert` only through the trigger and a `audit.log_event()` function; no `update`/`delete`
  grants to any app role, so entries are immutable from the app.
- Business events (exports, share links, login, assistant feedback) go to `audit.events` from the API service
  layer, not from routers.
- Retention: monthly partitions by `at` once volume justifies it; not in the first migration.
- Large blobs (file contents, chat text) are not copied into audit rows; only ids and metadata.

RLS: every table carries `tenant_id` and gets select/insert/update policies through `current_tenant_ids()`;
`profiles` is owner-only; `allowed_emails` is service-role only. Indexes on `(tenant_id, last_activity_at desc)`
for the sidebar and `(run_id, risk)` / `(run_id, abc_class)` for the filtered table.

---

## 6. Formulas module

Single pure module in the worker domain: `apps/worker/src/worker/domain/inventory.py`, tested with pytest, reused
by the API (what-if endpoint) and by a fixture generator that writes the frontend mock data (`apps/web/src/services/mock/fixtures/*.json`),
so mocks are coherent by construction.

- `projected_stock[t] = max(0, stock[t-1] - expected_demand[t] + arrivals[t])`
- `shortfall[t] = max(0, expected_demand[t] - (stock[t-1] + arrivals[t]))`
- `coverage_weeks = current_stock / typical_weekly_demand`, computed for the low and high scenarios so it is a range
- `risk`: `critical` if coverage < lead time; `medium` if < lead time + 2 weeks; `optimal` otherwise (thresholds from parameters)
- `suggested_qty = max(0, expected demand over target coverage + buffer - current_stock - on_order)`
- `buy_before = stockout_date - lead_time`; if in the past, return `order_today` with `days_without_stock`
- Projection starts at the file's cut-off date (`data_until`); emit a staleness warning when it is older than today
- Always ranges, never negative stock

Open: definition of `buffer`, ABC basis, reliability thresholds, monthly granularity (D11-D14).

---

## 7. API contract (outline; OpenAPI written in Phase 7)

All under `/v1`, Supabase JWT bearer, tenant resolved from membership. Errors are `{code, message_key, ref}`, no
internal codes shown in the UI.

| Method + path | Purpose |
|---|---|
| `POST /auth/otp` | Request magic link + code. Always 202 with the same body (no enumeration) |
| `POST /auth/verify` | Verify 6-digit code (or done client-side via Supabase, D7) |
| `GET /me` · `PATCH /me` | Profile (name, job title) |
| `GET /me/preferences` · `PUT /me/preferences` | Theme, locale, time zone, assistant style |
| `GET /conversations?group=&cursor=` | Sidebar list (pinned, today, week, older) |
| `PATCH /conversations/{id}` | Rename, pin, archive |
| `DELETE /conversations/{id}` · `POST /conversations/{id}/restore` | Soft delete + undo |
| `POST /uploads` (multipart) | Upload file → creates conversation + digest job; returns `{conversation_id, job_id}` |
| `GET /templates/sales.xlsx` | Template download |
| `GET /jobs/{id}` · `GET /jobs/{id}/events` (SSE) | Real stages and `processed/total` |
| `POST /jobs/{id}/cancel` | Cancel digestion |
| `GET /conversations/{id}/plan` | Detected sheets, mapping, samples, warnings, plausible date columns |
| `PUT /conversations/{id}/plan` | Confirm or correct mapping (one call) |
| `POST /conversations/{id}/forecast` | Answers or `skip: true` → forecast job |
| `GET /runs/{id}/summary` | KPIs, risk distribution, aggregate series, defaults used, staleness |
| `GET /runs/{id}/products?q=&risk=&abc=&sort=&page=` | Paginated, filtered table + focus count |
| `GET /runs/{id}/products/{code}` | Product detail: cards, weekly table, series |
| `POST /runs/{id}/products/{code}/simulate` | What-if for lead time / target coverage / purchase toggle (formulas module, no re-forecast) |
| `PUT /runs/{id}/parameters` · `POST /runs/{id}/recalculate` | Parameters drawer |
| `PUT /products/{code}/overrides` | Per-product lead time |
| `POST /runs/{id}/exports` | `{format: xlsx, scope: all|selection|product, codes?}` → file |
| `GET /conversations/{id}/messages` · `POST .../messages` (SSE stream) | Chat; optional `context_product_code` |
| `POST /messages/{id}/feedback` · `POST /messages/{id}/retry` | Message actions |
| `POST /conversations/{id}/share` | Share link (D10) |

LLM principles: the LLM only interprets; every number comes from `run_product_metrics` / `forecasts` and is sent as
a fixed context block; the assistant response is validated so that every figure it cites exists in that context,
and figures map to filter links (`{type: "filter", risk: "critical", count: 12}`). Normalization is two-step: the
LLM proposes a JSON plan from the file profile, and the worker executes it deterministically on the full file.

---

## 7b. Backend standards (FastAPI)

### Layout

`apps/api` mirrors the worker's hexagonal rule (dependencies point inward):

```
api/
  main.py              create_app(): middlewares, exception handlers, routers, lifespan (DB pool, OTel)
  settings.py          pydantic-settings, one Settings object, no secrets in code
  routers/             thin: parse request, call a service, map to a response schema
  schemas/             Pydantic request/response models = OpenAPI = TS contracts
  services/            use cases (conversations, uploads, runs, chat, exports, profile)
  domain/errors.py     AppError hierarchy (NotFound, Conflict, Validation, Forbidden, Unavailable)
  db/                  SQLAlchemy engine, session-per-request, tenant context, repositories
  assistant/           agent loop, tools, prompts, number guard (section 7c)
  observability/       logging config, middlewares, OTel setup, redaction
```

Conventions: `Annotated` dependencies, `response_model` on every route, async all the way down, one
`APIRouter` per resource under `/v1`, Pydantic v2 `model_config = ConfigDict(extra="forbid")` on inputs.

### ORM and migrations

- Migrations stay in `supabase/migrations` as plain SQL, applied with the Supabase CLI (as `CLAUDE.md` already
  says). RLS policies, `SECURITY DEFINER` functions, audit triggers, pgmq and grants are SQL-native; Alembic
  autogenerate does not model them, so a second migration tool would split the source of truth.
- ORM: **SQLAlchemy 2.0** (typed `Mapped[...]` models, async engine with `asyncpg`). It is the most mature
  Python ORM, has first-class async, and lets us run the per-transaction `set local role` / `set_config` needed
  for RLS. SQLModel was considered: it is a thin layer over SQLAlchemy that couples DB models to API schemas, and
  we want them separate (API schemas are the public contract).
- Models describe tables that the SQL migrations create; they never create tables. A pytest check runs
  `supabase db reset` locally and compares the reflected schema with the models, so drift fails CI.
- Through the Supabase pooler in transaction mode, asyncpg needs its prepared-statement cache disabled; the
  engine config sets it explicitly.
- The worker keeps Polars for bulk reads/writes (`COPY`-style inserts of sales and forecasts) and shares the
  table definitions module; no ORM objects in hot loops.

### Errors

- One exception hierarchy in `domain/errors.py`; services raise these, never `HTTPException`.
- Exception handlers in `main.py` turn them into RFC 9457 `application/problem+json`:
  `{type, title, status, code, message_key, ref, request_id}`. `message_key` is translated in the web app, so the
  UI never shows internal codes. `ref` is the short support reference shown in the failure screen (08d).
- Database errors are mapped once, by SQLSTATE, in the DB layer:

  | SQLSTATE | Meaning | HTTP |
  |---|---|---|
  | `23505` | unique violation | 409 |
  | `23503` | foreign key violation | 409 |
  | `23514` / `22P02` | check / invalid text representation | 422 |
  | `42501` | insufficient privilege (RLS) | 404 (never confirm another tenant's resource exists) |
  | `40001` / `40P01` | serialization failure / deadlock | retried once, then 503 |
  | `57014` | statement timeout | 504 |
  | `P0001` + `HINT` | business rule raised in SQL with a stable hint key | 422 with that key |

- Unhandled exceptions: 500 with `ref`, full stack trace logged once at `error` with the trace id.
- The worker records failures on `jobs.error_ref` and `jobs.status = failed`; it never writes stack traces to
  rows the UI can read.

### Logging, tracing and monitoring (Axiom)

One pipeline, OpenTelemetry end to end, exported over OTLP/HTTP to Axiom in every environment
(`https://<AXIOM_DOMAIN>/v1/traces` with `Authorization: Bearer` and `X-Axiom-Dataset`; source:
https://axiom.co/docs/guides/opentelemetry-python). Separate datasets per environment (`4castly-dev`,
`4castly-prod`); tokens from env vars only.

- **Structured logs**: `structlog` with a JSON renderer in deployed environments and a console renderer locally.
  Standard fields on every line: `timestamp`, `level`, `event`, `service` (`api|worker|web`), `env`, `version`,
  `request_id`, `trace_id`, `span_id`, `tenant_id`, `user_id`, `route`, `job_id` when present. Logs carry the
  trace context, so Axiom links a log line to its trace.
- **Middlewares** (pure ASGI, in this order): request id (accept or create `X-Request-ID`, echo it back), OTel
  FastAPI instrumentation, context binding (`contextvars` with tenant/user once auth resolves), access log
  (method, route template, status, duration; one line per request), body-size limit for uploads.
- **Levels**: `info` for business events and access lines, `warning` for handled 4xx that indicate misuse,
  `error` for 5xx and job failures, `debug` off in production.
- **Redaction processor**: drops or masks emails, JWTs, API keys, file contents and chat text before export.
  Client data never goes to Axiom.
- **Traces**: FastAPI, SQLAlchemy/asyncpg and httpx auto-instrumentation; manual spans around parse, plan
  execution, forecast per batch, and each agent turn. The worker continues the trace from the job's
  `traceparent` so an upload is one trace from HTTP request to finished forecast.
- **Frontend**: React error boundary + `window.onerror`/`unhandledrejection` → `POST /v1/client-logs`
  (rate limited, same redaction), so no Axiom token ships in the browser. The web app sends `traceparent` on
  API calls.
- **Monitors in Axiom**: 5xx rate per route, p95 latency per route, job failure rate, digest and forecast
  duration, assistant error rate and token spend per tenant.

### Testing

pytest per app (already set up), `httpx.AsyncClient` against `create_app()`, a local Supabase for DB and RLS
tests, contract test that regenerates OpenAPI and diffs it.

---

## 7c. AI assistant

### Model and call shape

- Model `claude-sonnet-5-5` (decided). Adaptive thinking is its default; effort set explicitly per route
  (`medium` for the chat agent, re-tuned with evals). Forced `tool_choice` is not supported on this model, so
  tools run with `auto` + `strict: true` schemas.
- Streaming with the official `anthropic` Python SDK (`client.messages.stream`), never an OpenAI-compatible shim.
- The server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is enabled
  by default on the Claude API.
- Prompt caching: frozen system prompt and tool list first, per-conversation data after the cache breakpoint;
  `usage.cache_read_input_tokens` logged per turn.

### Agent design

The agent is a tool-using loop, owned by us, behind an `AssistantAgent` port (same hexagonal rule as
`Forecaster`):

- **Tools** (all read the persisted run, never compute new forecasts): `get_run_summary`, `find_products`
  (filters: risk, ABC, query), `get_product_detail`, `simulate_purchase` (formulas module), `get_parameters`,
  `explain_reliability`. Every number the assistant may cite comes back from a tool.
- **Number guard**: after the turn, every figure in the answer is checked against the tool results of that turn.
  Unknown figures are removed and the turn is logged as a guard hit.
- **Filter links**: figures that correspond to a filter (`12 productos críticos`) are emitted as structured
  annotations so the web app renders them as links that apply the filter.
- **Context**: conversation scope (run) or product scope (detail drawer); assistant style (brief/detailed) and
  language come from preferences.
- **Normalization plan**: a separate single call with structured outputs (`output_config.format`, JSON schema
  of the plan) over the file profile; not part of the chat agent.

### Streaming to the browser (token by token)

`POST /v1/conversations/{id}/messages` returns `text/event-stream`. Events:

| Event | Payload |
|---|---|
| `message.start` | message id |
| `text.delta` | text chunk (rendered as it arrives) |
| `tool.start` / `tool.end` | human status line ("Revisando productos críticos…") |
| `annotation` | filter link or product link |
| `message.end` | final message id, usage, stop reason |
| `error` | `message_key`, `ref` |

The client reads it with `fetch` + `ReadableStream` (EventSource cannot send a POST body or auth header), supports
**Stop** (abort), **Retry**, auto-scroll that pauses when the user scrolls up, a streaming cursor, and Markdown
rendering of the final text. The message is persisted as it completes; a dropped connection shows the partial
text and a retry.

### LangChain: not now

Evaluated and not adopted for v1:

- We use one provider and one agent with five or six tools. The official SDK plus a ~100-line loop gives full
  control over streaming events, tool status lines, caching and the number guard.
- LangChain adds an abstraction over the message format and streaming events, frequent breaking changes, and
  another layer to debug when a stream misbehaves.
- Revisit LangGraph if we need multi-agent graphs with persisted checkpoints or human-in-the-loop steps. The
  `AssistantAgent` port keeps that swap contained.

### Langfuse: yes, for LLM observability

Langfuse covers what Axiom does not: LLM-specific traces (prompt, tools, tokens, cost per turn), user feedback,
prompt versions and evaluation datasets.

- Ingest over OpenTelemetry: Langfuse exposes an OTLP endpoint (`/api/public/otel`, Basic auth with the project
  keys; self-hosted from v3.22). The Anthropic Python SDK emits GenAI spans natively, so the same OTel setup
  sends them; a second span processor routes only LLM spans to Langfuse, while Axiom gets them without prompt
  content.
- Like / dislike in the chat become Langfuse scores linked to the turn's trace.
- System prompts versioned in Langfuse prompt management; each generation records the prompt version.
- Evaluation datasets from real conversations (anonymized) to tune effort and prompts.
- Hosting: EU cloud region or self-hosted (D21), because prompts contain client sales data.

---

## 8. Frontend architecture

Container/presentational + atomic design + a layout layer + a services port, mirroring the worker's hexagonal
layout:

```
apps/web/src/
  app/            router (layout routes), providers, guards, error boundary
  theme/          tokens.css (light/dark CSS variables), tailwind entry, fonts, theme store
  i18n/           es (default), en; namespaces per feature
  services/
    ports.ts      interfaces: AuthService, ConversationService, UploadService, JobService, RunService,
                  ChatService, ProfileService
    mock/         in-memory implementation + fixtures generated from the formulas module
    http/         real implementation + schema.gen.ts (OpenAPI) + SSE client
  ui/
    atoms/ molecules/ organisms/    presentational only (section 8.3)
  layouts/        AuthLayout, AppLayout, ConversationLayout, SettingsLayout (section 8.2)
  features/<area>/  containers (fetch via services), pages, hooks
```

Presentational components take props only; containers call the service port. Swapping mock → http is one
provider change per service.

### 8.1 Styling and theme (Tailwind + CSS variables)

- Tailwind CSS v4 (decided), with the Vite plugin.
- Design tokens live once, as CSS variables, in `theme/tokens.css`: `:root` holds light values and
  `[data-theme=dark]` holds dark values. Tailwind maps them with `@theme inline` (`--color-ink: var(--ink)`, etc.),
  so utilities like `bg-canvas text-ink border-hairline` switch theme without writing `dark:` on every element.
- The `dark` variant is redefined to follow the attribute
  (`@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`, per the Tailwind docs) for the few
  places that need a different shape, not just a different color.
- The theme store resolves `light | dark | system`; for `system` it listens to `prefers-color-scheme` and sets
  `data-theme` on `<html>`. A tiny inline script in `index.html` sets it before first paint (no flash). The same
  store is used by the user menu and Settings → Preferences, and persists to the profile.
- Components never use raw hex values or Tailwind palette colors (`blue-600`, `emerald-500`); only tokens.
  An oxlint rule or a test greps for it.

### 8.2 Layout layer

Screens share their frame, so layouts are React Router layout routes. The sidebar is mounted once and never
remounts while navigating between conversations.

```
<RootLayout>                         providers, theme, i18n, toasts, error boundary
  <AuthLayout>                       centered card + legal footer
    /login, /auth/callback
  <RequireAuth><AppLayout>           sidebar (260 px, collapsible; drawer on mobile) + <Outlet/>
    /nuevo                           NewForecastPage (whole-window drop target)
    /historial                       HistoryPage
    <ConversationLayout>             loads the conversation; chat column; switches by stage
      /c/:conversationId             chat-only stages, or chat 40 % + results 60 % when ready
                                     (?vista=portafolio: results full width + "Preguntar" drawer)
      /c/:conversationId/productos/:productCode   ProductDetailPage (+ chat drawer)
  <RequireAuth><SettingsLayout>      settings side nav, no conversation sidebar
    /configuracion/perfil, /configuracion/preferencias
  /dev/*                             dev-only (tokens, component gallery)
```

Shared regions inside layouts are organisms too (`ResultsHeader`, `SplitPane`), so a page only arranges them.

### 8.3 Atomic inventory

Built and tested bottom-up before any page. Each entry lists its states; every data-bound organism also has
`loading`, `empty` and `error`.

**Atoms**

| Component | Variants / states | Used in |
|---|---|---|
| `Button` | primary, secondary, ghost, danger-text; sm/md; loading, disabled; icon left/right | everywhere |
| `IconButton` | ghost, outline; tooltip label required | toolbar, sidebar, drawers |
| `TextLink` | inline underline, ink color; external | login footer, "Ver detalle" |
| `Icon` | one icon set, size tokens | everywhere |
| `Spinner` | sm/md | sidebar item, buttons, progress |
| `Skeleton` | line, block, circle | KPIs, chart, table |
| `Avatar` | initials, sizes | user card, menu, profile |
| `Logo` | mark "4C", mark + wordmark | auth, sidebar |
| `Input` | default, error, read-only (lock), disabled; with leading icon | login, profile, search |
| `Textarea` | autosize, max rows | composer |
| `OtpCell` | empty, filled, error | code input |
| `Select` (native-like listbox) | default, error, disabled, with "no tengo esta columna" option | mapping edit, preferences |
| `Checkbox` | unchecked, checked, indeterminate | table selection |
| `Radio` / `SegmentedControl` | 2-3 options, selected | theme, scenario toggle, tabs |
| `Switch` | on/off | (settings later) |
| `Chip` | outline (suggestion), selectable (answer), removable (filter) | chat, clarification, filters |
| `Badge` | neutral, "Próximamente", count | source cards, settings nav |
| `StatusDot` | processing, failed | sidebar item |
| `NumberValue` | Geist Mono, locale format, unit, range ("280–310 u") | KPIs, tables, cards |
| `DateValue` | locale date, relative ("hace 3 días") | tables, cards |
| `Kbd` | key hint | composer hint |
| `Divider` | horizontal, with label | chat history, menus |
| `VisuallyHidden` | n/a | a11y labels |

**Molecules**

| Component | Composition / states | Used in |
|---|---|---|
| `RiskBadge` | icon + text + color: Crítico / Medio / Óptimo | tables, detail, chat |
| `ReliabilityBadge` | Alta / Media / Baja, text first | KPIs, detail |
| `FileChip` | icon, middle-truncated name, size, remove, change; uploading, error | upload, chat bubble |
| `OtpInput` | 6 `OtpCell`, paste, backspace navigation | login |
| `FormField` | label, control, hint, error, optional tag | login, profile, mapping |
| `SearchField` | input + clear; accent-insensitive search is in the service | results |
| `FilterSelect` | label + select ("Riesgo: Todos") | results |
| `FocusChip` | "12 de 142 en foco · Restablecer" | results |
| `KpiCard` | label, value range, caption, link; loading, empty ("—") | results |
| `StatLine` | label + value, used inside cards | detail cards |
| `MessageActions` | copy, retry, like, dislike (toggle) | chat |
| `SuggestionChips` | max 3, outline, disabled while locked | chat |
| `AnswerChips` | single-select, "Otro" with inline input | clarification |
| `StageStep` | done, active, pending | job stepper |
| `ProgressCount` | indeterminate bar + "87 de 142 productos" | calculating |
| `ConversationItem` | title, active, pinned, processing, failed; hover menu; inline rename | sidebar, history |
| `UserCard` | avatar, name, company, menu trigger | sidebar |
| `MenuItem` | icon, label, danger, disabled | menus |
| `Pagination` | page/total, prev/next | table |
| `ColumnHeader` | sortable asc/desc, sticky | table |
| `EditableCell` | lead time inline edit, saving, error | portfolio |
| `Toast` | info, success, error; with "Deshacer" action | delete, save |
| `InlineNotice` | info, warning ("Falta stock…"), staleness | confirmation, results |
| `EmptyState` | icon, title, body, action | no conversations, no results |
| `ErrorState` | title, body, support ref, primary/secondary actions | 08a, 08d |
| `NumberStepper` | − value + with unit, min/max | detail cards |
| `StreamingText` | Markdown render, blinking cursor while streaming | chat |
| `ToolStatusLine` | spinner + human text | chat |

**Organisms**

| Component | Contains | Used in |
|---|---|---|
| `Sidebar` | Logo, collapse, "Nuevo forecast", `ConversationList`, history link, `UserCard` | AppLayout |
| `ConversationList` | groups Fijados / Hoy / Esta semana / Antes | Sidebar, history |
| `ConversationMenu` | Fijar, Renombrar, Archivar, Eliminar (+ confirm) | ConversationItem |
| `UserMenu` | identity, Configuración, theme, language, Cerrar sesión | Sidebar |
| `ChatThread` | message list, auto-scroll with pause, date dividers | conversation |
| `ChatMessage` | user (text or file) / assistant (streaming text, tool lines, actions, embedded card) | conversation |
| `Composer` | textarea, send/stop, locked state with reason, hint | conversation, drawers |
| `UploadDropzone` | empty, dragging, attached, error; window-level drop overlay | /nuevo, 08a |
| `SourceCard` | upload (primary), coming soon | /nuevo |
| `JobProgress` | stepper or simple loader, inline cancel | 03, 05 |
| `ColumnMappingCard` | read-only rows with samples ↔ edit mode with selects, sheet select | 04 |
| `ConfirmedDataLine` | "✓ Datos confirmados · Ver detalle" + expandable detail | 04+, 05, 06 |
| `ClarificationCard` | up to 2 questions, calculate, skip | 05 |
| `DateColumnPicker` | plausible columns with samples, "no tiene fechas" | 08b |
| `ResultsHeader` | breadcrumb, Compartir enlace, Exportar menu | results, detail |
| `ViewTabs` | "Chat + resultados" / "Portafolio" bound to `?vista=` | results |
| `ResultsFilters` | search, risk, ABC, focus chip | results |
| `KpiRow` | 3 `KpiCard` | results |
| `ForecastChart` | aggregate: history, expected, low/high range, past stockouts, today | results |
| `ProductForecastChart` | + projected stock, arrival, stockout marker | detail |
| `ProductTable` | sortable, filters, pagination, sticky first column, multi-select, column picker, editable lead time | results, portfolio |
| `BulkActionBar` | "3 seleccionados", Limpiar, Exportar selección | portfolio |
| `ProductSummaryCards` | runs-out card, purchase recommendation, reliability with technical detail | detail |
| `WeeklyProjectionTable` | scenario toggle, low/expected/high, projected stock, shortfall, status | detail |
| `ParametersDrawer` | horizon, granularity, lead time, threshold, assistant style, Recalcular | results |
| `AssistantDrawer` | chat scoped to run or product | portfolio, detail |
| `ExportMenu` | Excel: all, selection, product | results, detail |
| `SettingsNav` | back link, sections, "Próximamente" items | settings |
| `ProfileForm` / `PreferencesForm` | dirty/saving/saved states | settings |
| `Drawer` / `Dialog` / `Popover` | focus trap, Esc, return focus | shared |

### 8.4 Chat behaviour (like current AI chat apps)

Token-by-token rendering from the SSE stream (section 7c), Stop while generating, Retry on the last answer,
copy / like / dislike, tool status lines while the agent works, Markdown with tables, figures rendered as filter
links, auto-scroll that stops when the user scrolls up and a "jump to latest" button, composer locked with a
reason when the stage does not allow questions, optimistic user message, and partial answers kept on error.

TypeScript models (generated from OpenAPI later; hand-written in mock phase with the same names):
`User`, `Profile`, `Preferences`, `Conversation`, `ConversationStage`, `ConversationGroup`, `Upload`, `FileProfile`,
`NormalizationPlan`, `ColumnMapping`, `DataWarning`, `Job`, `JobStage`, `ClarificationAnswers`, `ForecastRun`,
`RunParameters`, `RunSummary`, `RiskLevel`, `AbcClass`, `ProductRow`, `ProductDetail`, `WeeklyProjectionRow`,
`SeriesPoint`, `Scenario`, `Reliability`, `ChatMessage`, `MessageKind`, `FilterLink`, `Feedback`, `ExportRequest`,
`ShareLink`, `ApiError`.

### 8.5 Dependencies to add

Web (`apps/web`):

| Need | Package | Why |
|---|---|---|
| Fonts | `geist` | Official package, self-hosted woff2, no CDN at runtime |
| Styling | `tailwindcss` v4 + `@tailwindcss/vite` | Decided; tokens via CSS variables |
| Class composition | `clsx` + `tailwind-merge` | Variant props without class conflicts |
| Routing + URL state | `react-router` 7 | Layout routes, guards, search-param state for `?vista=` and filters |
| Server state | `@tanstack/react-query` | Caching, job polling/SSE invalidation, optimistic pin/rename/delete |
| i18n | `i18next` + `react-i18next` | es/en, interpolation, plurals ("1 producto" / "12 productos") |
| Accessible primitives | `radix-ui` (unstyled) | Focus management and keyboard nav for menus, popovers, dialogs, listbox, tabs |
| Markdown in chat | `react-markdown` + `remark-gfm` | Assistant answers with lists and tables |
| Tests | `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` | None exist today |
| Component gallery | Storybook (Vite builder) or the dev-only `/dev` routes (D22) | Atoms/molecules/organisms reviewed in isolation before pages |
| Contracts | `openapi-typescript` (dev) | TS types from FastAPI OpenAPI |
| Visual check | Playwright (dev) | 1440 px and 390 px comparisons |

API (`apps/api`, via `uv add`): `sqlalchemy[asyncio]`, `asyncpg`, `anthropic`, `structlog`,
`opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http`, `opentelemetry-instrumentation-fastapi`,
`opentelemetry-instrumentation-sqlalchemy`, `opentelemetry-instrumentation-httpx`, `langfuse` (scores and prompt
management), `python-multipart` (uploads), `openpyxl` (Excel export).

Worker: `structlog` and the same OpenTelemetry packages; `sqlalchemy` for the shared table definitions.

---

## 9. Decisions

### Decided (2026-10-23)

| # | Decision |
|---|---|
| D1 | Backend stays FastAPI; contracts generated from OpenAPI |
| D6 | Styling: Tailwind CSS v4 with CSS-variable tokens for light/dark |
| D16 | Assistant model: `claude-sonnet-5-5` via the official Anthropic SDK, guided by a context-aware agent |
| D23 | ORM: SQLAlchemy 2.0 async; migrations stay as Supabase SQL |
| D24 | Multi-tenancy: shared schema + `tenant_id` + RLS, enforced for the API too |
| D25 | Auditing: row-change triggers + business events in an append-only `audit` schema |
| D26 | Observability: OpenTelemetry + structured logs to Axiom (dev and prod datasets) |
| D27 | LangChain not adopted for v1; Langfuse adopted for LLM traces, feedback, prompt versions |
| D28 | Frontend: layout layer (layout routes) and atomic inventory built before pages |
| D2 | Design precedence: brief override rules > Stitch > `DESIGN.md` (section 3) |
| D3-D22 | Accepted as recommended in the table below |

### Accepted recommendations (2026-10-23)

| # | Decision | Recommendation |
|---|---|---|
| D3 | Dark theme palette (none designed) | Derive from Geist dark: canvas #0a0a0a, elevated #111, hairline #262626, ink #ededed, primary inverted; status colors tuned for 4.5:1 |
| D4 | Rename `skus` → `products` in the DB | Yes, now, before data exists |
| D5 | Replace `forecast_jobs` with generic `jobs` (`digest|forecast`) | Yes |
| D7 | Auth: Supabase Auth email OTP (magic link + 6-digit code) with an allowlist enforced by a `before user created` hook | Yes |
| D8 | Accessible primitives: hand-rolled vs Radix UI (unstyled, styled with Tailwind) | Radix |
| D9 | Results header (breadcrumb + Compartir + Exportar) on chat-mode screens | Inside the results panel only, not a full-width top bar |
| D10 | "Compartir enlace" semantics | Company-internal link (login required, same tenant). No public links |
| D11 | `buffer` in suggested quantity | High scenario minus expected scenario over lead time + target coverage |
| D12 | ABC class basis (no price in the template) | By volume share: A 80 %, B 15 %, C 5 % |
| D13 | Reliability Alta / Media / Baja thresholds | From rolling backtest error per product, set after the backtest work |
| D14 | Monthly granularity | Forecast weekly, aggregate to months for display |
| D15 | Exports | Excel only for v1 |
| D17 | Single primary per results / detail screen | None in results; "Preguntar sobre este producto" secondary |
| D18 | Magic-link TTL and resend cooldown | 30 s resend; TTL from Supabase default, not shown in copy |
| D19 | "Pedidos en camino" source | Defaults to 0, editable per product later |
| D20 | URL slugs in Spanish | Yes; not localized per language |
| D21 | Langfuse hosting (prompts contain client sales data) | Langfuse Cloud EU region to start; self-host if a client requires it |
| D22 | Component gallery: Storybook vs dev-only `/dev` routes | Storybook: isolated states, a11y addon, visual review per component without the app shell |

## 10. Phase plan

The atomic inventory comes before any page.

| Phase | Output | Depends on |
|---|---|---|
| 1 | Tailwind v4, Geist, CSS-variable tokens light/dark, theme store, `/dev/tokens` | D2, D3 |
| 2 | Atoms → molecules → organisms (section 8.3) with tests and the gallery, all states | Phase 1, D22 |
| 3 | Layout layer: router, RootLayout, AuthLayout, AppLayout (sidebar, menus), ConversationLayout, SettingsLayout, guards, i18n | Phase 2, D7, D20 |
| 4 | Services port + mock; login, upload, digestion, confirmation, clarification, errors | Phase 3 |
| 5 | Results, portfolio, product detail; formulas module + fixtures; streaming chat UI against a mock stream | D11-D14, D17 |
| 6 | Settings + full dark variant review | Phase 3 |
| 7 | Backend foundation: migration 0002 (tenancy, audit, new tables), SQLAlchemy layer, errors, logging/OTel to Axiom | D4, D5 |
| 8 | Assistant agent (Sonnet 5.5, tools, number guard, SSE), Langfuse, OpenAPI codegen, http services screen by screen | Phase 7, D21 |

Phase 7 (backend foundation) and the formulas module touch no web files, so they can run in parallel with
phases 1-3.

---

## 11. Security, end to end (proposal for review)

### Threat model

| Asset | Who could hurt it | Main controls |
|---|---|---|
| Client sales and stock data, uploaded files | Another tenant's user; outside attacker; leaked key | RLS for API and browser, private storage, JWT verification, least-privilege DB roles |
| Accounts | Email enumeration, OTP brute force, session theft | Allowlist, neutral copy, OTP limits, short tokens, CSP |
| Assistant | Prompt injection through file contents (column or product names); invented numbers | Untrusted data never in the system prompt, read-only tenant-scoped tools, number guard |
| Exports | Formula injection when the Excel is opened | Escape cells that start with `= + - @` |
| Platform | Dependency compromise, secret leaks | Lockfiles, audits in CI, secret scanning, pinned Actions |

Trust boundaries: browser ↔ API, API/worker ↔ Postgres, API/worker ↔ Storage, API ↔ Anthropic / Langfuse / Axiom.

### Identity and sessions

- **S1 Passwordless, invite-only.** Users are provisioned by invite (row in `allowed_emails` + Supabase user).
  Login calls `signInWithOtp` with `shouldCreateUser: false`. A `before user created` auth hook (Postgres
  function, documented by Supabase) rejects any email not in `allowed_emails` as a second line of defense.
  The UI shows the same neutral message whatever happens, so it never reveals whether an email exists.
- **S2 OTP settings.** 6-digit code. Expiry lowered to 10 minutes (Supabase default `GOTRUE_MAILER_OTP_EXP` is
  24 h). Minimum interval between emails per address: Supabase defaults to 1 minute, the brief asks for a 30 s
  resend countdown, so we either set the limit to 30 s or show a 60 s countdown (S-open-1). Custom SMTP
  provider in production.
- **S3 Tokens.** Access token TTL 1 h, refresh token rotation with reuse detection (Supabase defaults). The
  SPA keeps the session in browser storage, so XSS is the main session risk; the strict CSP (S12) is the
  mitigation. "Cerrar sesión" revokes the refresh token.
- **S4 API authentication.** The API verifies every JWT locally with the project's asymmetric signing keys
  (JWKS endpoint `/auth/v1/.well-known/jwks.json`, cached at most 10 minutes so key rotation works), and checks
  `iss`, `aud` and `exp`. The tenant comes from `tenant_members` in the database, never from a header or body.
- **S5 Authorization.** Roles `owner | admin | member`. Members: everything about forecasts in their tenant.
  Admins: invite/remove users, tenant defaults. Owners: plan and tenant deletion (later). Checked in services
  and enforced again by RLS. Access to another tenant's id returns 404, not 403.

### Data protection

- **S6 Storage.** Private bucket, object path `tenant_id/upload_id/<file>`, storage policies by tenant folder.
  Downloads only through signed URLs valid for 60 s. Originals deleted after a retention period (proposal:
  30 days, S-open-2); derived data stays.
- **S7 Secrets.** No secrets in the repo (already enforced by hooks). Service-role key and DB passwords only on
  the server side; the web app gets only the Supabase URL and anon key. Each environment has its own Supabase
  project, keys and Axiom/Langfuse datasets. Keys rotated on staff change.
- **S8 Database roles.** `app_api` (no `BYPASSRLS`, `statement_timeout` 5 s), `app_worker` (bypasses RLS, always
  filters by the job's tenant, longer timeout), migrations applied only by CI with a separate role.
- **S9 Third parties.** Anthropic receives the file profile (column names, types, a small sample of rows) and
  aggregated run metrics, never the full file. Langfuse receives prompts and answers (EU region). Axiom receives
  no client content. This list goes into the privacy policy; data-retention terms with Anthropic and Langfuse are
  reviewed before the first client (zero data retention can be requested if a client requires it).
- **S10 Offboarding.** Tenant deletion removes rows by cascade and the storage folder; audit rows are kept for
  the legal retention period.

### Input, files and output

- **S11 Uploads.** Size and row limits enforced by the API before storing (values to decide, not shown as promises
  in the UI). File type checked by content, not extension: `.xlsx` (zip), `.xls` (OLE), `.csv` (text). Macro
  formats (`.xlsm`) rejected. Parsing happens only in the worker: openpyxl in read-only mode, `defusedxml`
  installed (openpyxl's own recommendation against XML attacks), a limit on uncompressed size against zip bombs,
  and a per-job time limit.
- **S12 Web headers.** Strict CSP (scripts from self plus the hashed theme script; `connect-src` limited to the
  API and Supabase), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `frame-ancestors 'none'`. CORS allowlist with exact origins.
- **S13 Request validation.** Pydantic with `extra="forbid"`, length limits on every string, page-size caps,
  sort and filter fields from allowlists.
- **S14 Excel exports.** Cells from user data that start with `=`, `+`, `-`, `@`, tab or carriage return are
  written as text, so a malicious product name cannot run a formula.
- **S15 Share links.** Tenant-internal only, login required, 128-bit random token, expiry, revocable, audited.

### Assistant (LLM)

- **S16 Prompt injection.** File contents, column names and product names are untrusted. They only reach the
  model inside tool results or delimited data blocks, never in the system prompt. Tools are read-only (except
  the pure `simulate_purchase`), receive the tenant and run from the request context, and cannot be pointed at
  another tenant or run by the model.
- **S17 Output safety.** Number guard (section 7c). Markdown rendered without raw HTML; links only to internal
  routes the app builds from annotations. `refusal` stop reasons handled with a neutral message.
- **S18 Abuse and cost.** Per-user message rate limit, `max_tokens` per turn, daily token budget per tenant
  (S-open-3), alerts in Axiom when a tenant approaches it.

### Platform and supply chain

- **S19 Dependencies.** `uv.lock` and `pnpm-lock.yaml` committed, Dependabot or Renovate, `pip-audit` and
  `pnpm audit` in CI, GitHub Actions pinned by commit SHA, secret scanning (gitleaks) in the pre-commit hooks.
- **S20 Rate limiting.** Supabase limits the auth endpoints. API limits per user and tenant (uploads, chat,
  exports) are enforced at the edge or in middleware depending on hosting (S-open-4).
- **S21 Security monitoring.** Axiom monitors for spikes in failed logins, 401/403/404 on tenant resources,
  RLS denials (`42501`), upload rejections and guard hits.

---

## 12. Resilience (proposal for review)

### Principles

The app degrades by feature, never as a whole. Results, portfolio and product detail are computed and
persisted, so they keep working when the assistant, the forecaster or a third party is down.

| Dependency down | What the user still has | What they see |
|---|---|---|
| Anthropic | Results, portfolio, detail, exports, uploads | Chat: "El asistente no está disponible en este momento" + retry. Column detection falls back to a deterministic name/type matcher; the user confirms the mapping anyway, so the fallback is safe |
| Worker / queue | Existing results, chat over them | New uploads wait in `queued` with a "en cola" status, never a fake progress bar |
| Langfuse / Axiom | Everything | Nothing; exporters drop data after a bounded buffer, never block requests |
| Postgres | Nothing (hard dependency) | Maintenance page; health check fails so the platform restarts or routes away |

### Jobs (digest and forecast)

- **R1 Queue semantics.** pgmq with a visibility timeout. Handlers are idempotent by `job_id`: results are built
  first and published in one transaction (`forecast_runs` switches to ready only at the end), so a retried job
  never leaves half a run visible.
- **R2 Retries.** Up to 3 attempts with exponential backoff for transient errors (DB, network, LLM 429/5xx).
  Deterministic errors (unreadable file, no date column) fail fast with their own stage and message, no retry.
  After the last attempt the job is `failed` with a support `ref`, and the message is archived (dead letter).
- **R3 Stuck jobs.** Workers write `heartbeat_at`; a reaper re-queues jobs whose heartbeat is older than the
  timeout. Cancellation ("Cancelar" in digestion) sets a flag checked between stages.
- **R4 Per-product isolation.** If one product's forecast fails, it falls back to the baseline model, then to the
  simple method; the run never fails because of one product. The reliability label shows it.
- **R5 Concurrency limits.** One active forecast job per conversation; a cap per tenant so one large file does
  not starve other companies.

### Requests

- **R6 Timeouts everywhere.** DB statement timeouts per role, Anthropic client timeout with the SDK's built-in
  retries (429, 5xx, connection errors), outbound HTTP timeouts, upload size and time limits.
- **R7 Idempotency keys.** `Idempotency-Key` header on upload, forecast, export and chat-message POSTs, stored per
  tenant for 24 h, so a double click or a network retry never creates two jobs or two answers.
- **R8 Streaming.** SSE keep-alive comments every 15 s. If the client disconnects mid-answer, generation stops,
  the partial answer is saved as `interrupted`, and the UI offers "Reintentar". Job progress uses SSE with a
  polling fallback (`GET /jobs/{id}` every few seconds).
- **R9 Health.** `/health/live` (process up) and `/health/ready` (DB and queue reachable). Graceful shutdown:
  the API drains in-flight requests; the worker finishes its current stage or lets the message become visible
  again.

### Data

- **R10 Backups.** Daily backups plus point-in-time recovery for production (Supabase add-on, cost decision
  S-open-5). A restore drill before the first client and then every quarter.
- **R11 Migrations.** Expand/contract only (add, backfill, switch, then remove in a later release), so the
  previous API version keeps working during a deploy and a rollback never needs a down migration.

### Frontend

- **R12 Fetching.** React Query retries GETs with backoff, never non-idempotent POSTs (those rely on
  idempotency keys). Optimistic pin/rename/delete with rollback and the undo toast.
- **R13 Error containment.** Error boundaries per layout and per panel: a chart failure shows the panel's error
  state, not a blank page. Offline banner when the browser loses connectivity.

### Targets (proposed, to calibrate with real data)

API availability 99.5 % monthly; p95 under 500 ms for reads; digest of a typical client file under 2 minutes;
assistant first token under 3 s. Monitored in Axiom (section 7b).

### Open security and resilience decisions

| # | Decision | Recommendation |
|---|---|---|
| S-open-1 | Resend countdown vs Supabase per-address email limit | Set the limit to 30 s to keep the brief's countdown |
| S-open-2 | Retention of original uploaded files | 30 days, then delete; derived data kept |
| S-open-3 | Daily assistant token budget per tenant | Start generous, alert at 80 %, tune after the first client |
| S-open-4 | Hosting for API, worker and web (decides WAF, edge rate limits, secret store) | Needs your call |
| S-open-5 | Point-in-time recovery for production | Yes before the first real client |
| S-open-6 | Upload size and row limits | Set from the first client's real files |
