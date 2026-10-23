import type { ChatMessage } from '../../services/types'
import { filterLinkHref } from '../shared/resultsUrl'

type Annotation = NonNullable<ChatMessage['annotations']>[number]

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/** True when `index` falls between the two halves of a surrogate pair. */
function splitsPair(text: string, index: number): boolean {
  return index > 0 && index < text.length && isHigh(text.charCodeAt(index - 1)) && isLow(text.charCodeAt(index))
}

function isValid(text: string, a: Annotation): boolean {
  return (
    Number.isInteger(a.start) &&
    Number.isInteger(a.end) &&
    a.start >= 0 &&
    a.end > a.start &&
    a.end <= text.length &&
    !splitsPair(text, a.start) &&
    !splitsPair(text, a.end)
  )
}

const escapeLabel = (span: string) => span.replace(/[[\]\\]/g, '\\$&')

function hrefOf(a: Annotation, conversationId: string): string {
  return a.type === 'filter'
    ? filterLinkHref(conversationId, a.link)
    : `/c/${conversationId}/productos/${encodeURIComponent(a.code)}`
}

/**
 * Wraps the cited figures of an assistant answer in Markdown links so the existing Markdown renderer shows them
 * as links. The text itself is never rewritten: offsets are UTF-16 code units of `text`, and any annotation that
 * is out of range, empty, overlapping an earlier one or cutting a surrogate pair is ignored.
 */
export function annotateMarkdown(text: string, annotations: readonly Annotation[] | undefined, conversationId: string): string {
  if (!annotations?.length) return text
  const sorted = annotations.filter((a) => isValid(text, a)).toSorted((a, b) => a.start - b.start || b.end - a.end)

  let out = ''
  let cursor = 0
  for (const a of sorted) {
    if (a.start < cursor) continue
    out += text.slice(cursor, a.start)
    out += `[${escapeLabel(text.slice(a.start, a.end))}](${hrefOf(a, conversationId)})`
    cursor = a.end
  }
  return out + text.slice(cursor)
}
