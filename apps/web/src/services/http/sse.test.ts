import { describe, expect, it } from 'vitest'
import { parseSse, type SseFrame } from './sse'

const enc = new TextEncoder()

function streamOf(chunks: (string | Uint8Array)[], failWith?: Error): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        const chunk = chunks[i++]
        controller.enqueue(typeof chunk === 'string' ? enc.encode(chunk) : chunk)
        return
      }
      if (failWith) controller.error(failWith)
      else controller.close()
    },
  })
}

async function collect(iterable: AsyncIterable<SseFrame>): Promise<SseFrame[]> {
  const out: SseFrame[] = []
  for await (const frame of iterable) out.push(frame)
  return out
}

describe('parseSse', () => {
  it('parses frames in the API format', async () => {
    const frames = await collect(
      parseSse(streamOf(['event: message.start\ndata: {"a":1}\n\nevent: text.delta\ndata: {"t":"hi"}\n\n'])),
    )
    expect(frames).toEqual([
      { event: 'message.start', data: '{"a":1}' },
      { event: 'text.delta', data: '{"t":"hi"}' },
    ])
  })

  it('reassembles a frame split at any byte boundary', async () => {
    const text = 'event: text.delta\ndata: {"t":"hola"}\n\nevent: message.end\ndata: {}\n\n'
    for (let cut = 1; cut < text.length; cut++) {
      const frames = await collect(parseSse(streamOf([text.slice(0, cut), text.slice(cut)])))
      expect(frames.map((f) => f.event)).toEqual(['text.delta', 'message.end'])
      expect(frames[0].data).toBe('{"t":"hola"}')
    }
  })

  it('does not break a multibyte character that arrives in two chunks', async () => {
    const bytes = enc.encode('event: text.delta\ndata: {"t":"Ácido cítrico — 日本"}\n\n')
    const middle = bytes.indexOf(0xc3) + 1 // between the two bytes of "Á"
    const frames = await collect(parseSse(streamOf([bytes.slice(0, middle), bytes.slice(middle)])))
    expect(JSON.parse(frames[0].data)).toEqual({ t: 'Ácido cítrico — 日本' })
  })

  it('joins multi-line data with newlines', async () => {
    const frames = await collect(parseSse(streamOf(['event: x\ndata: line one\ndata: line two\n\n'])))
    expect(frames).toEqual([{ event: 'x', data: 'line one\nline two' }])
  })

  it('accepts CRLF line endings', async () => {
    const frames = await collect(parseSse(streamOf(['event: x\r\ndata: 1\r\n\r\nevent: y\r\ndata: 2\r\n\r\n'])))
    expect(frames).toEqual([
      { event: 'x', data: '1' },
      { event: 'y', data: '2' },
    ])
  })

  it('ignores comments such as keep-alive heartbeats', async () => {
    const frames = await collect(parseSse(streamOf([': keep-alive\n\nevent: x\ndata: 1\n\n: keep-alive\n\n'])))
    expect(frames).toEqual([{ event: 'x', data: '1' }])
  })

  it('strips one leading space from values and keeps the rest', async () => {
    const frames = await collect(parseSse(streamOf(['event:x\ndata:  two spaces\n\n'])))
    expect(frames).toEqual([{ event: 'x', data: ' two spaces' }])
  })

  it('defaults the event name to "message"', async () => {
    const frames = await collect(parseSse(streamOf(['data: 1\n\n'])))
    expect(frames).toEqual([{ event: 'message', data: '1' }])
  })

  it('flushes a final frame that has no trailing blank line', async () => {
    const frames = await collect(parseSse(streamOf(['event: message.end\ndata: {}\n'])))
    expect(frames).toEqual([{ event: 'message.end', data: '{}' }])
  })

  it('emits nothing for an empty stream or a frame without data', async () => {
    expect(await collect(parseSse(streamOf([])))).toEqual([])
    expect(await collect(parseSse(streamOf(['event: only-a-name\n\n'])))).toEqual([])
  })

  it('stops quietly when aborted and cancels the underlying reader', async () => {
    const controller = new AbortController()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: x\ndata: 1\n\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    const seen: SseFrame[] = []
    for await (const frame of parseSse(body, controller.signal)) {
      seen.push(frame)
      controller.abort()
    }
    expect(seen).toHaveLength(1)
    expect(cancelled).toBe(true)
  })

  it('returns immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await collect(parseSse(streamOf(['event: x\ndata: 1\n\n']), controller.signal))).toEqual([])
  })

  it('propagates a read error so the caller can report a dropped connection', async () => {
    const body = streamOf(['event: x\ndata: 1\n\n'], new TypeError('network error'))
    const seen: SseFrame[] = []
    await expect(
      (async () => {
        for await (const frame of parseSse(body)) seen.push(frame)
      })(),
    ).rejects.toThrow('network error')
    expect(seen).toEqual([{ event: 'x', data: '1' }])
  })
})
