import type { chatEs } from './chat.es'

export const chatEn: typeof chatEs = {
  thread: {
    label: 'Conversation with the assistant',
    jump: 'Jump to latest message',
    loading: 'Loading messages…',
    emptyTitle: 'Ask your first question',
    emptyBody: 'Ask which products are at risk, how much to buy or when to order.',
    errorTitle: "We couldn't load the messages",
    errorBody: 'Try again in a few seconds.',
  },
  author: { you: 'You', assistant: 'Assistant' },
  composer: {
    label: 'Type your question',
    placeholder: 'Ask about your data',
    send: 'Send',
    stop: 'Stop',
    hintSend: 'to send',
    hintNewline: 'for a new line',
  },
  suggestions: { label: 'Suggested questions' },
  actions: {
    label: 'Message actions',
    copy: 'Copy',
    retry: 'Retry answer',
    like: 'Helpful answer',
    dislike: 'Unhelpful answer',
  },
  copied: 'Answer copied',
  copyFailed: "We couldn't copy the text",
  feedbackFailed: "We couldn't save your rating",
  status: {
    writing: 'The assistant is writing…',
    done: 'Answer complete',
    stopped: 'Answer stopped',
  },
  note: {
    interrupted: 'The answer stopped before it finished.',
    errorTitle: "We couldn't answer",
    reference: 'Reference: {{ref}}',
    retry: 'Retry',
  },
  tool: {
    reviewingCritical: 'Reviewing the critical products…',
    searchingProducts: 'Searching products…',
    readingProduct: 'Reading the product detail…',
  },
  errors: {
    assistant: 'The assistant could not answer. Try again.',
    rateLimited: 'Too many questions in a row. Wait a moment and try again.',
    generic: 'Something went wrong. Try again.',
  },
}
