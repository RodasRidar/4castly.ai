export interface SseFrame {
  event: string
  data: string
}

/** One line of the stream: `field: value`, a comment (`:` prefix) or a blank separator. */
function fieldOf(line: string): { name: string; value: string } {
  const colon = line.indexOf(':')
  if (colon === -1) return { name: line, value: '' }
  const value = line.slice(colon + 1)
  return { name: line.slice(0, colon), value: value.startsWith(' ') ? value.slice(1) : value }
}

/**
 * Parses a `fetch` body as Server-Sent Events (the API sends `event: <name>\ndata: <json>\n\n`, with comment
 * lines as heartbeats). Aborting ends the iteration quietly and cancels the reader; a read error propagates so
 * the caller can tell "connection dropped" from "stopped by the user".
 */
export async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseFrame> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  const onAbort = () => void reader.cancel().catch(() => undefined)
  if (signal?.aborted) {
    onAbort()
    return
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  let buffer = ''
  let event = ''
  let data: string[] = []

  const flush = (): SseFrame | null => {
    const frame = data.length > 0 ? { event: event || 'message', data: data.join('\n') } : null
    event = ''
    data = []
    return frame
  }

  // Consumes complete lines from the buffer; yields a frame at each blank line.
  function* lines(final: boolean): Generator<SseFrame> {
    for (;;) {
      const match = /\r\n|\n|\r/.exec(buffer)
      // A trailing "\r" may be the first half of "\r\n": wait for more bytes unless the stream ended.
      if (!match || (!final && match[0] === '\r' && match.index === buffer.length - 1)) break
      const line = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      if (line === '') {
        const frame = flush()
        if (frame) yield frame
      } else if (!line.startsWith(':')) {
        const { name, value } = fieldOf(line)
        if (name === 'event') event = value
        else if (name === 'data') data.push(value)
      }
    }
  }

  try {
    for (;;) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* lines(false)
    }
    buffer += decoder.decode()
    yield* lines(true)
    if (buffer) {
      // Final line without a terminator.
      const { name, value } = buffer.startsWith(':') ? { name: '', value: '' } : fieldOf(buffer)
      if (name === 'event') event = value
      else if (name === 'data') data.push(value)
      buffer = ''
    }
    const last = flush()
    if (last) yield last
  } catch (error) {
    if (signal?.aborted) return
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock?.()
  }
}
