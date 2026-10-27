/**
 * Copy for the assistant chat. Backend message keys (`assistant.tool.*`, `errors.*`) are resolved through
 * `backendKey()` into the `chat.tool.*` and `chat.errors.*` entries below; see features/chat/backendKey.ts.
 */
export const chatEs = {
  thread: {
    label: 'Conversación con el asistente',
    jump: 'Ir al último mensaje',
    loading: 'Cargando mensajes…',
    emptyTitle: 'Haz tu primera pregunta',
    emptyBody: 'Pregunta qué productos están en riesgo, cuánto comprar o cuándo pedir.',
    errorTitle: 'No pudimos cargar los mensajes',
    errorBody: 'Inténtalo de nuevo en unos segundos.',
  },
  author: { you: 'Tú', assistant: 'Asistente' },
  composer: {
    label: 'Escribe tu pregunta',
    placeholder: 'Pregunta sobre tus datos',
    send: 'Enviar',
    stop: 'Detener',
    hintSend: 'para enviar',
    hintNewline: 'para una nueva línea',
  },
  suggestions: { label: 'Preguntas sugeridas' },
  actions: {
    label: 'Acciones del mensaje',
    copy: 'Copiar',
    retry: 'Reintentar respuesta',
    like: 'Respuesta útil',
    dislike: 'Respuesta no útil',
  },
  copied: 'Respuesta copiada',
  copyFailed: 'No pudimos copiar el texto',
  feedbackFailed: 'No pudimos guardar tu valoración',
  status: {
    writing: 'El asistente está escribiendo…',
    done: 'Respuesta completa',
    stopped: 'Respuesta detenida',
  },
  note: {
    interrupted: 'La respuesta se detuvo antes de terminar.',
    errorTitle: 'No pudimos responder',
    reference: 'Referencia: {{ref}}',
    retry: 'Reintentar',
  },
  tool: {
    reviewingCritical: 'Revisando los productos críticos…',
    searchingProducts: 'Buscando productos…',
    readingProduct: 'Leyendo el detalle del producto…',
    getRunSummary: 'Revisando el resumen del pronóstico…',
    findProducts: 'Buscando productos…',
    getProductDetail: 'Leyendo el detalle del producto…',
    simulatePurchase: 'Simulando la compra…',
    getParameters: 'Revisando los parámetros…',
    working: 'Consultando tus datos…',
  },
  errors: {
    assistant: 'El asistente no pudo responder. Inténtalo de nuevo.',
    unavailable: 'El asistente no está disponible por ahora. Inténtalo en unos minutos.',
    timeout: 'El asistente tardó demasiado en responder. Inténtalo de nuevo.',
    refusal: 'El asistente no puede responder a esa pregunta. Prueba con otra sobre tus productos.',
    rateLimited: 'Hay demasiadas preguntas seguidas. Espera un momento e inténtalo de nuevo.',
    generic: 'Algo salió mal. Inténtalo de nuevo.',
  },
}
