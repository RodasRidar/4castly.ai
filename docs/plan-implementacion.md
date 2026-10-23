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

Per the brief's priority order `DESIGN.md` beats frames, but the brief's override rules contradict `DESIGN.md`
on C1-C3, C5, C7, C9. Proposal: the override rules win, and `DESIGN.md` gets an "App overrides" section so there
is one source of truth (D2).

---

## 4. Backend decision: FastAPI or NestJS (D1)

Question: since this is a monorepo with shared contracts, should the SaaS backend be NestJS, with Python only
where needed?

Recommendation: keep FastAPI. Reasons, from this repo:

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

## 8. Frontend architecture (proposal)

Container/presentational + atomic design + a services port, mirroring the worker's hexagonal layout:

```
apps/web/src/
  app/            router, providers, guards, error boundary
  theme/          tokens.css (light/dark), fonts, ThemeProvider (single source with preferences)
  i18n/           es (default), en; namespaces per feature
  services/
    ports.ts      interfaces: AuthService, ConversationService, UploadService, JobService, RunService, ChatService, ProfileService
    mock/         in-memory implementation + fixtures generated from the formulas module
    http/         real implementation + schema.gen.ts (OpenAPI)
  shared/ui/
    atoms/        Button (primary|secondary|ghost|danger-text), IconButton, Input, OtpInput, Select, Checkbox,
                  SegmentedControl, Chip, Badge, Spinner, Skeleton, Avatar, TextLink, Kbd, Tooltip, NumberStepper
    molecules/    RiskBadge, FileChip, KpiCard, SuggestionChips, AnswerChips, FocusChip, SearchField, Pagination,
                  MessageActions, ConversationItem, UserCard, Toast, ConfirmCard, EmptyState, ErrorState
    organisms/    Sidebar, ConversationList, UserMenu, Composer, ChatMessage, JobProgress, UploadDropzone,
                  ColumnMappingCard, ClarificationCard, ForecastChart, ProductForecastChart, ProductTable,
                  ParametersDrawer, Drawer, ExportMenu, SettingsNav
    templates/    AuthLayout, AppShell, ConversationLayout (40/60), SettingsLayout
  features/<area>/  containers (fetch via services), page components, hooks
```

Presentational components take props only; containers call the service port. Swapping mock → http is one
provider change per service.

TypeScript models (generated from OpenAPI later; hand-written in mock phase with the same names):
`User`, `Profile`, `Preferences`, `Conversation`, `ConversationStage`, `ConversationGroup`, `Upload`, `FileProfile`,
`NormalizationPlan`, `ColumnMapping`, `DataWarning`, `Job`, `JobStage`, `ClarificationAnswers`, `ForecastRun`,
`RunParameters`, `RunSummary`, `RiskLevel`, `AbcClass`, `ProductRow`, `ProductDetail`, `WeeklyProjectionRow`,
`SeriesPoint`, `Scenario`, `Reliability`, `ChatMessage`, `MessageKind`, `FilterLink`, `Feedback`, `ExportRequest`,
`ShareLink`, `ApiError`.

### Dependencies to add (each needs your OK)

| Need | Proposal | Why |
|---|---|---|
| Fonts | `geist` (official package, self-hosted woff2) | No CDN at runtime |
| Routing + URL state | `react-router` 7 | Mature, nested layouts and guards, search-param state for `?vista=` and filters |
| Server state | `@tanstack/react-query` | Caching, polling/SSE invalidation, optimistic pin/rename/delete |
| i18n | `i18next` + `react-i18next` | es/en, interpolation, plurals ("1 producto" / "12 productos") |
| Tests | `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` | Component + service tests; none exist |
| Contracts | `openapi-typescript` (dev) | Generate TS from FastAPI OpenAPI |
| Styling | Decision D6 | |
| Accessible primitives (menus, popovers, dialogs, listbox) | Decision D8 | |
| Visual check | Playwright (dev) | The brief asks for 1440 px and 390 px comparisons |

---

## 9. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Backend: FastAPI vs NestJS | FastAPI (section 4) |
| D2 | Brief override rules vs `DESIGN.md` (C1-C10) | Override rules win; add an "App overrides" section to `DESIGN.md`; fix line 60 |
| D3 | Dark theme palette (none designed) | Derive from Geist dark: canvas #0a0a0a, elevated #111, hairline #262626, ink #ededed, primary inverted to #ededed on #0a0a0a; status colors tuned for 4.5:1 |
| D4 | Rename `skus` → `products` in the DB | Yes, now, before data exists |
| D5 | Replace `forecast_jobs` with generic `jobs` (`digest|forecast`) | Yes |
| D6 | Styling system: plain CSS custom properties + CSS Modules (zero deps) vs Tailwind v4 (faster to port the Stitch HTML) | CSS Modules + tokens: the frames' Tailwind is inconsistent and gets rewritten anyway |
| D7 | Auth: Supabase Auth email OTP (magic link + 6-digit code in one email) with an allowlist enforced by a `before user created` hook | Yes |
| D8 | Accessible primitives: hand-rolled vs Radix UI (unstyled) | Radix: focus management and keyboard nav for menus/popovers/dialogs/listbox are hard to get right |
| D9 | Results header (breadcrumb + Compartir + Exportar) on chat-mode screens: is it the forbidden "top bar"? | Keep it inside the results panel only, not full width |
| D10 | "Compartir enlace" semantics | Company-internal link (requires login, same tenant). No public links |
| D11 | `buffer` in suggested quantity | High scenario minus expected scenario over lead time + target coverage |
| D12 | ABC class basis (no price in the template) | By volume (quantity share): A 80 %, B 15 %, C 5 % |
| D13 | Reliability Alta / Media / Baja thresholds | From rolling backtest error per product; thresholds set after the backtest work |
| D14 | Monthly granularity | Forecast weekly, aggregate to months for display |
| D15 | Exports | Excel only for v1 (frames also show CSV/PDF) |
| D16 | LLM provider and model for normalization plan + chat | Needs your call (cost, data residency of client files) |
| D17 | Which single primary per results screen: "Exportar plan de compra" or nothing | None in results; "Exportar" stays secondary. On product detail: none; "Preguntar sobre este producto" secondary |
| D18 | Magic-link TTL and resend cooldown | 30 s resend (brief); TTL from Supabase default, not shown in copy |
| D19 | "Pedidos en camino" source (not in the template) | Defaults to 0, editable per product later |
| D20 | URL slugs in Spanish (`/nuevo`, `/c/:id/productos/:code`, `?vista=portafolio`) | Yes; not localized per language |

## 10. Phase plan

| Phase | Output | Depends on |
|---|---|---|
| 1 | Geist, tokens light/dark, `/dev/tokens` | D2, D3, D6 |
| 2 | AppShell, sidebar, menus, router, guards, theme + i18n single source | D7, D8, D20 |
| 3 | Shared components with loading/empty/error states + tests | Phase 1 |
| 4 | Services port + mock; login, upload, digestion, confirmation, clarification, errors | Phase 2-3 |
| 5 | Results, portfolio, product detail; formulas module + fixtures | D11-D14, D17 |
| 6 | Settings + full dark variant | Phase 2 |
| 7 | Migration 0002, OpenAPI, real http services screen by screen | D1, D4, D5, D16 |

Formulas module and migration 0002 can start in parallel with Phase 1 since they do not touch the web app.
