# Decisiones pendientes tras B5 (2026-10-26, actualizado 2026-10-27)

> **Resueltas el 2026-10-27:** D6 (C: Colima + Supabase local), D7 (A: subproceso por job), D7b (TimesFM 3.0
> en local; AutoETS en dev y producción) y D8 (verificado con el modelo real; hallazgos abajo). La guía para
> ejecutarlo está en [`desarrollo-local.md`](desarrollo-local.md). Siguen abiertas las demás y la nueva D17.

Documento para leer y decidir. Primero el contexto (qué está hecho y dónde), después cómo se ejecuta
todo en local, y al final una ficha por decisión: problema, opciones con su costo y una recomendación.
Responder con el número y la letra (por ejemplo "D6-C").

## 1. Dónde está cada cosa

| Pregunta | Respuesta verificada |
|---|---|
| ¿Lo del worktree del backend ya está en `dev`? | Sí. `feat/backend` (`5fa29de`) es ancestro de `dev` (`23dc139`). |
| ¿Y en el remoto? | También: `5fa29de` está en `origin/dev` y en `origin/main`. Producción (`main`) ya tiene B4 y B5, más un commit de Vercel (`39a0b02`) que agrega 2 líneas a `apps/api/pyproject.toml`. |
| ¿Qué integró el frontend? | 5 commits locales de `dev` que `origin/dev` aún no tiene (`4428258`..`23dc139`): cliente HTTP, servicios http para todos los puertos, cliente SSE, selección real/mock y un test de contrato "live" opcional. |
| ¿Hay algo sin commitear en el worktree del backend? | Solo `.atl/.skill-registry.cache.json` y `.atl/skill-registry.md`, regenerados por la herramienta de skills. No son míos; no los toqué. |

El frontend usa la API real cuando existe `VITE_API_URL` **y** un cliente de Supabase configurado, y
`VITE_USE_MOCK` no es `1`. Si falta cualquiera, cae a los mocks.

## 2. Ejecutarlo todo en local

### Puertos (verificados en el repo)

| Pieza | Puerto | Cómo |
|---|---|---|
| API (FastAPI) | **8000** | `make dev-api` (uvicorn por defecto) |
| Web (Vite) | **5173** | `make dev-web` (Vite por defecto) |
| Supabase local: API/Auth/Storage | **54321** | `supabase start` |
| Supabase local: Postgres | **54322** | `supabase start` |
| Supabase local: Studio / correo (Inbucket) | **54323 / 54324** | `supabase start` |

La web ya apunta a `http://localhost:8000` (`VITE_API_URL`) y la API acepta CORS solo de
`http://localhost:5173`. Si abrís la web como `http://127.0.0.1:5173`, el navegador la bloquea.

### Lo que hoy NO funciona en local

1. **No hay Docker** en esta máquina (`docker` no existe; `supabase` y `psql` sí). `supabase start`
   necesita un runtime de contenedores. Los tests usan un Postgres efímero con un "shim", que no tiene
   login (GoTrue) ni Storage.
2. **El worker solo arranca por Modal.** No existe un lanzador local: la API solo sabe llamar a
   `modal.Function.spawn` y el worker no tiene una entrada de línea de comandos. Hay que escribir ambas.
3. **La IA no corre en tu máquina.** El chat y la propuesta de mapeo llaman a la API de Anthropic
   (hace falta `ANTHROPIC_API_KEY`; sin clave, el digest usa el matcher determinista y el chat da 503).
   Lo que sí puede correr en local es el **pronóstico**: AutoETS (statsforecast) o TimesFM 3.0.

## 3. Decisiones

### Entorno local

**D6. ¿Con qué infraestructura corre el desarrollo local?** — RESUELTA: C. `make local-up`.
Problema: el login, el almacenamiento y la base necesitan Supabase, y no hay Docker.
- A. Proyecto Supabase hospedado de dev, y API, web y worker en local. Cero instalación, fidelidad
  total; requiere cuenta, SMTP (Resend) y depender de internet.
- B. Todo sin contenedores: Postgres local con el shim, un emisor de tokens falso y almacenamiento en
  disco. Más código nuestro (login de desarrollo, adaptador de archivos local) y se aleja de producción.
- C. Instalar Colima + CLI de Docker (`brew install colima docker`) y usar `supabase start`: Auth,
  Storage y correo (Inbucket) reales y locales, sin SMTP ni cuenta. Cuesta ~2 GB de RAM de una VM.
- Recomendación: **C**. Es lo único que da "todo local" con la misma pila que producción, y sirve también
  para los tests de contra-prueba que hoy faltan. Si no querés instalar nada, A.

**D7. ¿Cómo se ejecuta el worker/modelo en local?** — RESUELTA: A. `JOB_RUNNER=local`, `python -m worker.local`.
Problema: falta el lanzador local (ver 2.2). Hay que construir `LocalJobSpawner` en la API y una entrada
`python -m worker.local` (o un bucle que consulte la tabla `jobs`).
- A. La API lanza un subproceso por job (`uv run --project apps/worker ...`). Simple, mismo contrato
  que Modal, un proceso por job.
- B. Un proceso worker aparte que sondea `jobs` cada pocos segundos. Más parecido al "re-spawn" de
  producción; hay que levantar una terminal más.
- Recomendación: **A**, y B solo si querés ver el worker como proceso visible. En ambos casos la elección
  entre Modal y local será una variable (`JOB_RUNNER=modal|local`), sin tocar la lógica.

**D7b. ¿Qué pronosticador corre en local por defecto?** — RESUELTA: TimesFM 3.0 en local (`FORECASTER=timesfm`, solo con `ENVIRONMENT=local`); AutoETS en el resto.
- A. AutoETS (statsforecast), el de producción. En la prueba con el Kardex real salió mejor (WAPE 44,5 %
  contra 53,6 % de TimesFM).
- B. TimesFM 3.0 solo en local (pesos no comerciales, ~GB de descarga, `uv sync --group local`).
- Recomendación: **A** por defecto y TimesFM opt-in con `FORECASTER=timesfm`. Hoy el código no tiene ese
  selector (está fijo en AutoETS): es trabajo pendiente.

**D8. Anthropic y Langfuse en desarrollo.** — RESUELTA para Anthropic (Langfuse sigue sin probarse). Hallazgos: `strict` no admite `minimum`/`maximum` (corregido); el modelo reutilizaba ids de turnos viejos y agregaba unidades de más (corregido en el prompt); prompt caching y replay de bloques funcionan. ¿Pongo una clave de prueba para validar el agente de verdad?
Hoy el adaptador solo se probó con un doble del SDK. Quedan sin confirmar: el parámetro
`output_config={"effort": ...}`, `strict` en las tools, el replay de bloques de thinking y que el modelo
responda bien a los mensajes de contexto que mando como `user`.
- A. Sí, una clave de dev con tope de gasto; hago una sesión de verificación de ~10 turnos reales.
- B. Esperar hasta el despliegue en dev.
- Recomendación: **A**. Langfuse puede esperar: es opcional y no afecta al flujo (**D9**: nube UE si lo
  activamos; evita autohospedar al inicio).

### Producto y comportamiento

**D1. Stage `clarifying`: ¿quién lo asigna?**
Problema: nada lo asigna. `PUT plan` deja `confirmed`, y `start_forecast` acepta `confirmed` o `clarifying`.
- A. Dejarlo así: el frontend muestra la pregunta de aclaración en `confirmed` y `clarifying` desaparece.
- B. La API pasa a `clarifying` al confirmar el plan (el mapa de estados del plan original).
- Recomendación: **A** y borrar `clarifying` del enum en una limpieza posterior; menos estados que
  sincronizar. Si el frontend ya depende de `clarifying`, **B**.

**D2. Granularidad mensual.** El contrato la permite; el worker solo calcula semanal; la API da 422.
- A. Quitar `monthly` del contrato (cambio chico, el frontend ya no la ofrece).
- B. Implementarla en el worker (agregación y fórmulas por mes: trabajo grande).
- C. Dejar el 422 como está.
- Recomendación: **A**. Si no hay cliente que la pida, no se paga por ella.

**D3. Tope diario de tokens por tenant (S-open-3).** Hoy: 1500 tokens de salida por turno y 60
mensajes/hora por usuario. ¿Fijamos un tope diario por tenant (por ejemplo 200k tokens) con alerta en
Axiom?
- Recomendación: sí, 200 000 tokens/día/tenant y alerta al 80 %. Con un solo cliente piloto es un seguro
  contra bucles y abusos; se ajusta con datos reales.

**D4. Límites provisionales.** Hoy: 25 MiB por archivo, 30 subidas/hora, 30 pronósticos/hora,
60 exportaciones/hora. ¿Los confirmamos para el piloto?
- Recomendación: dejarlos; subir 25 MiB solo si el Kardex real pesa más (¿cuánto pesa el archivo del
  cliente?). **Pregunta tuya:** tamaño real del archivo.

**D12. Resumen del plan tras corregir el mapeo.** Al corregir columnas, `summary` queda en `null`
(los conteos eran del mapeo anterior), así que la tarjeta no muestra cifras hasta recalcular.
- A. Dejarlo en `null`.
- B. Que la confirmación dispare un digest rápido que recalcule el resumen (más código y más espera).
- Recomendación: **A** para el piloto.

**D13. Rechazo del modelo con texto parcial ya enviado.** Si el modelo emite texto y luego rechaza, el
usuario ya vio el texto. Se guarda un error neutro y no se reenvía.
- A. Dejarlo (probabilidad baja, impacto bajo).
- B. Retener los primeros ~40 caracteres antes de mostrar (retrasa el primer token).
- Recomendación: **A**.

**D17. Archivos sin columna de stock: ¿qué mostrar?** — RESUELTA: C (2026-10-27). Con `stock_known = false` la API no entrega riesgo, cobertura, compra sugerida ni «comprar antes de»; sí entrega demanda, ABC, fiabilidad y el pronóstico con su rango. Detalle del cambio de contrato abajo.
Problema: sin stock se asume 0, así que todos los productos salen "críticos" con cobertura 0 y la compra
sugerida es la demanda completa del horizonte. El resultado es matemáticamente coherente pero engañoso.
- A. Dejarlo, con el aviso `stock_known = false` ya presente en el resumen (el chat ya lo menciona).
- B. Pedir el stock actual en la pantalla de aclaración (una pregunta más, o un campo por producto).
- C. Con `stock_known = false`, no clasificar riesgo ni cobertura: mostrar solo demanda esperada y rango.
- Recomendación: **C** para el piloto. Un "todo crítico" falso quita credibilidad; B es la mejora siguiente.

### Calidad y operación

**D5. Revisión nativa (RDD) del código ya integrado.** B4 quedó "alto riesgo" (auth, 7,4 k líneas) y
ya está en `main`. B5 es "riesgo medio, bajo presupuesto".
- A. Consentir ahora una revisión por tramos: primero `auth.py` y los servicios de límites/idempotencia
  (lo de seguridad), después el resto.
- B. Aceptar el riesgo: hay 850+ tests, RLS verificado y revisión humana tuya.
- C. Revisión independiente solo de seguridad (RLS + JWT) con otro modelo.
- Recomendación: **A solo sobre auth y RLS**. Es donde un error cuesta más; no es necesario revisar todo.

**D11. Claves de idempotencia vencidas.** Reusar una clave después de 24 h da 409 porque no hay forma de
borrarla. ¿Cómo limpiamos?
- A. Tarea diaria en el worker (`delete from idempotency_keys where expires_at < now()`).
- B. Migración que da `delete` a la API y limpia al reservar.
- Recomendación: **A** (junto con el keep-alive diario que ya existe); el worker ya tiene rol con permiso.

**D14. Verificación contra servicios reales** (Supabase Storage, Modal, Langfuse). Con **D6-C** quedan
cubiertos Storage y Auth; Modal pasa a ser solo producción.
- Recomendación: una prueba de humo de punta a punta con un Kardex sintético; para Modal, hacerla en el
  primer despliegue a dev.

**D15. Producción ya tiene B4/B5.** `origin/main` incluye todo, y Vercel desplegará lo que apunte a `main`.
Faltan variables (`ANTHROPIC_API_KEY`, `LANGFUSE_*`, `MODAL_*`, `JWT_*`) y medir el tamaño del paquete
(`modal` pesa).
- A. Dejarlo: sin clave el chat da 503 y sin base la API da 503; no rompe nada visible.
- B. Revertir `main` al estado previo hasta que el piloto lo necesite.
- Recomendación: **A**, pero no cargar datos reales hasta cerrar D5.

**D16. Actualizar `docs/plan-implementacion.md`.** Me vetaste editarlo. Propongo agregar: la migración
0003 (`pending_params`), la regla "mensajes sin UPDATE" y los ids de cifras, la ausencia de stubs y el
404 en lugar de 403. ¿Lo hago yo o lo editás vos?
- Recomendación: lo hago yo en un commit aparte, que revisás en el diff.

## 4. Trabajo pendiente de implementación (no requiere decidir, sí ordenar)

| # | Trabajo | Depende de |
|---|---|---|
| I1 | ~~`LocalJobSpawner` + `python -m worker.local` + variable `JOB_RUNNER`~~ hecho | D7 |
| I2 | ~~Selector de pronosticador `FORECASTER`~~ hecho | D7b |
| I3 | ~~`make local-up` / `local-down`~~ hecho; falta un `.env.local.example` por app y un `make dev` único | D6 |
| I4 | Semilla local: tenant, usuario y un Kardex sintético (`api.provisioning` ya existe) | D6 |
| I5 | Purga de claves de idempotencia | D11 |
| I6 | Tope diario de tokens por tenant | D3 |
| I7 | Prueba de humo de punta a punta: hecha a mano con un script (login, subida, digest, confirmación, pronóstico, resultados, chat); falta dejarla en el repo (`make e2e-local`) y probar la web en navegador | D6, D7 |
| I8 | Quitar `monthly` o `clarifying` del contrato y regenerar mocks | D1, D2 |

## 5. Orden sugerido

1. D6, D7, D7b (desbloquean probar todo en tu máquina).
2. D1, D2 (cambian el contrato; mejor antes de que el frontend avance).
3. D5, D15 (riesgo ya en producción).
4. El resto, en cualquier orden.

## 6. D17-C: cambio de contrato para el frontend

Cuando `RunSummary.stock_known` es `false` (el archivo no traía columna de stock):

| Dónde | Cambio |
|---|---|
| `ProductRow` | `risk`, `current_stock`, `coverage_weeks`, `suggested_quantity` y `buy_before` pasan a ser `null` (y `stockout_date` también). `typical_demand`, `abc_class`, `reliability`, `lead_time_*` siguen. |
| `RunKpis` | `products_at_risk` y `average_coverage_weeks` pasan a ser `null`. `reliability` sigue. |
| `RunSummary` | `risk_distribution` pasa a ser `null`. `series_by_uom` y `total_products` siguen. |
| `ProductDetail` | `purchase`, `without_new_purchase` y `with_suggested_purchase` pasan a ser `null`. **Campo nuevo `forecast`** (siempre presente, también con stock): `weekly` (semana, inicio, demanda baja/esperada/alta) y `series` (historia con semanas censuradas + pronóstico con rango, sin stock proyectado). |
| `GET /runs/{id}/products` | `risk=...` responde 422 (`errors.stockUnknown`). Ordenar por riesgo, cobertura, stock, compra sugerida o «comprar antes de» ordena por nombre, en la misma dirección. |
| `POST .../simulate` | 409 (`errors.stockUnknown`): una simulación necesita un stock de partida. |
| Exportación | Solo las columnas código, producto, unidad, clase ABC, demanda típica y fiabilidad. |
| Chat | Las tools no devuelven riesgo ni cobertura, y el prompt le indica explicar una sola vez que falta el stock. |

Los tipos de TypeScript quedan nulables en esos campos: el compilador marcará cada lugar que los use.
Claves i18n nuevas: `errors.stockUnknown`. Sin cambios en base de datos ni en el worker: el worker sigue
calculando con stock 0, y la API oculta esas cifras al leerlas.
