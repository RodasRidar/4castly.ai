import conversationsFx from './fixtures/conversations.json'
import entryFlow from './fixtures/entry-flow.json'
import session from './fixtures/session.json'
import { createChatService } from './chat'
import { failure } from './errors'
import { createRunService, NO_STOCK_CONVERSATION_ID, NO_STOCK_RUN_ID, normalize } from './runs'
import type { Services } from '../ports'
import type {
  Conversation,
  ConversationDetail,
  Job,
  PlanView,
  Preferences,
  UploadCreate,
  UploadErrorCode,
  User,
} from '../types'

/** Code accepted by the mock OTP verification. */
export const MOCK_OTP_CODE = '123456'

/** Test and story switches to exercise error states. */
export interface MockControls {
  failConversations: boolean
  failPatch: boolean
  failUpload: boolean
  failRun: boolean
  failMe: boolean
  failUpdateMe: boolean
  failChat: boolean
  /** Delay between streamed chat events (ms). */
  chatDelayMs: number
  /** Job ids whose next `advance()` is held back (to look at a running state). */
  advance(jobId?: string): void
  /** Advances running jobs by one step every `ms`; returns the stop function. */
  autoAdvance(ms: number): () => void
  setSession(signedIn: boolean): void
}
export type MockServices = Services & MockControls

interface Outcome {
  stage: 'awaiting_confirmation' | 'unreadable' | 'needs_date_column' | 'failed'
  errorCode?: UploadErrorCode
}

/** Decides what digesting a file does from its name, so every entry-flow state is reproducible by hand. */
export function digestOutcome(fileName: string): Outcome {
  const name = fileName.toLowerCase()
  if (/protegido|locked|password/.test(name)) return { stage: 'unreadable', errorCode: 'password_protected' }
  if (/corrupt|danado|dañado/.test(name)) return { stage: 'unreadable', errorCode: 'corrupt' }
  if (/sin-fechas|nodate|sin_fechas/.test(name)) return { stage: 'needs_date_column' }
  if (/falla|fail/.test(name)) return { stage: 'failed' }
  return { stage: 'awaiting_confirmation' }
}

const clone = <T,>(value: T): T => structuredClone(value)
const uuid = () => crypto.randomUUID()

export interface MockOptions {
  signedIn?: boolean
  latencyMs?: number
  /** Start with no conversations (empty sidebar and history states). */
  emptyConversations?: boolean
  preferences?: Partial<Preferences>
  /** Adds a ready conversation whose file had no stock column (`NO_STOCK_CONVERSATION_ID`). */
  withoutStock?: boolean
}

export function createMockServices({ signedIn = true, latencyMs = 0, emptyConversations = false, preferences: initialPreferences, withoutStock = false }: MockOptions = {}): MockServices {
  let hasSession = signedIn
  let user = clone(session.user) as User
  let preferences = { ...(clone(session.preferences) as Preferences), ...initialPreferences }
  const conversations = new Map<string, ConversationDetail>(
    emptyConversations ? [] : (conversationsFx.details as unknown as ConversationDetail[]).map((c) => [c.id, clone(c)]),
  )
  if (withoutStock) {
    const ready = clone([...conversations.values()].find((c) => c.current_run_id)!)
    conversations.set(NO_STOCK_CONVERSATION_ID, {
      ...ready,
      id: NO_STOCK_CONVERSATION_ID,
      title: 'Ventas sin stock',
      file_name: 'ventas_sin_stock.csv',
      current_run_id: NO_STOCK_RUN_ID,
    })
  }
  const plans = new Map<string, PlanView>()
  const jobs = new Map<string, Job>()
  const answers = new Map<string, unknown>()
  const uploads = new Map<string, UploadCreate>()
  const outcomes = new Map<string, Outcome>()

  const wait = () => (latencyMs > 0 ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve())
  const plansFx = entryFlow.plans as unknown as Record<string, PlanView>
  const jobsFx = entryFlow.jobs as unknown as Record<string, Job>

  const planFor = (c: ConversationDetail): PlanView | undefined => {
    const name = (c.file_name ?? '').toLowerCase()
    switch (c.stage) {
      case 'needs_date_column':
        return clone(plansFx.needs_date_column)
      case 'awaiting_confirmation':
        return clone(name.includes('kardex') ? plansFx.kardex_proposed : plansFx.tabular_proposed)
      case 'confirmed':
      case 'clarifying':
      case 'calculating':
      case 'ready':
      case 'failed': {
        const base = clone(name.includes('kardex') ? plansFx.kardex_proposed : plansFx.tabular_confirmed)
        return { ...base, status: 'confirmed' }
      }
      default:
        return undefined
    }
  }

  const jobFor = (c: ConversationDetail): Job | undefined => {
    if (!c.current_job_id) return undefined
    const template =
      c.stage === 'calculating' ? jobsFx.forecast_running : c.stage === 'queued' ? jobsFx.digest_running : jobsFx.digest_running
    const job = clone(template)
    job.id = c.current_job_id
    job.conversation_id = c.id
    if (c.stage === 'queued') {
      job.status = 'queued'
      job.stage = null
      job.stages = job.stages.map((s) => ({ ...s, state: 'pending' as const }))
    }
    return job
  }

  for (const c of conversations.values()) {
    const plan = planFor(c)
    if (plan) plans.set(c.id, plan)
    const job = jobFor(c)
    if (job) jobs.set(job.id, job)
  }

  const touch = (c: ConversationDetail) => {
    c.last_activity_at = new Date().toISOString()
  }

  const toSummary = (c: ConversationDetail): Conversation => {
    const { upload: _upload, ...summary } = c
    return summary
  }

  const finishDigest = (job: Job) => {
    const c = conversations.get(job.conversation_id)
    if (!c) return
    const outcome = outcomes.get(c.id) ?? digestOutcome(c.file_name ?? '')
    c.stage = outcome.stage
    c.current_job_id = null
    if (outcome.stage === 'unreadable' && c.upload) {
      c.upload = { ...c.upload, status: 'failed', error_code: outcome.errorCode ?? 'corrupt' }
    } else if (outcome.stage === 'failed') {
      job.status = 'failed'
      job.error_ref = 'K7Q2WX'
    } else {
      if (c.upload) c.upload = { ...c.upload, status: 'readable' }
      const plan = planFor(c)
      if (plan) plans.set(c.id, plan)
    }
    touch(c)
  }

  const finishForecast = (job: Job) => {
    const c = conversations.get(job.conversation_id)
    if (!c) return
    c.stage = 'ready'
    c.current_job_id = null
    // A recalculation keeps its run; a first forecast gets the fixture run.
    c.current_run_id ??= (conversationsFx.details as unknown as ConversationDetail[]).find((d) => d.current_run_id)?.current_run_id ?? null
    // Stored overrides and saved parameters take effect when a calculation finishes, not before.
    runsMock.applyStoredOverrides()
    touch(c)
  }

  const stepJob = (job: Job) => {
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') return
    job.status = 'running'
    const active = job.stages.findIndex((s) => s.state === 'active')
    if (active === -1) {
      job.stages[0] = { ...job.stages[0], state: 'active' }
      job.stage = job.stages[0].stage
      return
    }
    job.stages[active] = { ...job.stages[active], state: 'done' }
    const next = job.stages[active + 1]
    if (next) {
      job.stages[active + 1] = { ...next, state: 'active' }
      job.stage = next.stage
      if (job.kind === 'forecast' && next.stage === 'calculating_forecast') {
        job.total = 26
        job.processed = 0
      }
      return
    }
    job.status = 'succeeded'
    job.stage = null
    job.finished_at = new Date().toISOString()
    if (job.kind === 'digest') finishDigest(job)
    else finishForecast(job)
  }

  // The run and chat mocks read these live, so toggling `mock.failRun` etc. takes effect immediately.
  const runControls = { get failRun() { return mock.failRun } }

  const runsMock = createRunService({
    controls: runControls,
    startRecalculation(runId) {
      const c = [...conversations.values()].find((x) => x.current_run_id === runId)
      if (!c) throw failure('not_found')
      const job: Job = {
        ...clone(jobsFx.forecast_running),
        id: uuid(),
        conversation_id: c.id,
        status: 'queued',
        stage: null,
        stages: jobsFx.forecast_running.stages.map((s) => ({ ...s, state: 'pending' as const })),
        processed: null,
        total: null,
        created_at: new Date().toISOString(),
      }
      jobs.set(job.id, job)
      c.stage = 'calculating'
      c.current_job_id = job.id
      touch(c)
      return { job_id: job.id, conversation_id: c.id }
    },
  })
  const chatControls = {
    get failChat() { return mock.failChat },
    get chatDelayMs() { return mock.chatDelayMs },
  }

  const mock: MockServices = {
    failConversations: false,
    failPatch: false,
    failUpload: false,
    failRun: false,
    failMe: false,
    failUpdateMe: false,
    failChat: false,
    chatDelayMs: 0,
    advance(jobId) {
      for (const job of jobs.values()) if (!jobId || job.id === jobId) stepJob(job)
    },
    autoAdvance(ms) {
      const timer = setInterval(() => mock.advance(), ms)
      return () => clearInterval(timer)
    },
    setSession(next) {
      hasSession = next
    },

    auth: {
      async hasSession() {
        await wait()
        return hasSession
      },
      async requestCode(email) {
        await wait()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('validation')
        // Same outcome for every well-formed email: the UI must never reveal whether it is enabled.
      },
      async verifyCode(_email, code) {
        await wait()
        if (code !== MOCK_OTP_CODE) throw failure('validation', { code: 'invalid_code', message_key: 'errors.invalidCode', fields: [] })
        hasSession = true
      },
      async signOut() {
        await wait()
        hasSession = false
      },
    },

    profile: {
      async getMe() {
        await wait()
        if (mock.failMe) throw failure('failure')
        return user
      },
      async updateMe(patch) {
        await wait()
        if (mock.failUpdateMe) throw failure('failure')
        // Same rule the API applies: a name needs at least 2 characters (fixtures/errors.json `validation`).
        if (patch.full_name != null && patch.full_name.trim().length < 2) throw failure('validation')
        user = { ...user, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null)) }
        return user
      },
      async getPreferences() {
        await wait()
        return preferences
      },
      async updatePreferences(patch) {
        await wait()
        if (mock.failPatch) throw failure('failure')
        preferences = { ...preferences, ...patch }
        return preferences
      },
    },

    conversations: {
      async list() {
        await wait()
        if (mock.failConversations) throw failure('failure')
        return [...conversations.values()]
          .filter((c) => !c.deleted_at && !c.archived)
          .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
          .map(toSummary)
      },
      async search({ q = '', includeArchived = false, cursor = null, limit = 30 } = {}) {
        await wait()
        if (mock.failConversations) throw failure('failure')
        const needle = normalize(q.trim())
        const all = [...conversations.values()]
          .filter((c) => !c.deleted_at && (includeArchived || !c.archived))
          .filter((c) => !needle || normalize(c.title).includes(needle) || normalize(c.file_name ?? '').includes(needle))
          .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
        const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0
        const next = start + limit
        return { items: all.slice(start, next).map(toSummary), nextCursor: next < all.length ? String(next) : null }
      },
      async get(id) {
        await wait()
        const c = conversations.get(id)
        if (!c || c.deleted_at) throw failure('not_found')
        return clone(c)
      },
      async update(id, patch) {
        await wait()
        const c = conversations.get(id)
        if (!c) throw failure('not_found')
        if (patch.title != null) c.title = patch.title
        if (patch.pinned != null) {
          c.pinned = patch.pinned
          c.group = patch.pinned ? 'pinned' : 'today'
        }
        if (patch.archived != null) c.archived = patch.archived
        return toSummary(c)
      },
      async remove(id) {
        await wait()
        const c = conversations.get(id)
        if (!c) throw failure('not_found')
        c.deleted_at = new Date().toISOString()
      },
      async restore(id) {
        await wait()
        const c = conversations.get(id)
        if (!c) throw failure('not_found')
        c.deleted_at = null
        return toSummary(c)
      },
      async getPlan(id) {
        await wait()
        const plan = plans.get(id)
        if (!plan) throw failure('not_found')
        return clone(plan)
      },
      async confirmPlan(id, confirmation) {
        await wait()
        const c = conversations.get(id)
        const plan = plans.get(id)
        if (!c || !plan) throw failure('not_found')
        const next: PlanView = { ...plan, status: 'confirmed', proposed_by: confirmation.plan ? 'user' : plan.proposed_by }
        if (confirmation.plan) {
          next.plan = confirmation.plan
          next.selected_sheet = confirmation.plan.sheet
          next.date_column_candidates = []
          next.mappings = plan.mappings.map((m) => (m.field === 'date' ? { ...m, column: confirmation.plan?.date?.column ?? m.column } : m))
        }
        plans.set(id, next)
        c.stage = 'clarifying'
        touch(c)
        return clone(next)
      },
      async startForecast(id, request) {
        await wait()
        const c = conversations.get(id)
        if (!c) throw failure('not_found')
        const job: Job = {
          ...clone(jobsFx.forecast_running),
          id: uuid(),
          conversation_id: id,
          status: 'queued',
          stage: null,
          stages: jobsFx.forecast_running.stages.map((s) => ({ ...s, state: 'pending' as const })),
          processed: null,
          total: null,
          created_at: new Date().toISOString(),
        }
        jobs.set(job.id, job)
        answers.set(id, request)
        c.stage = 'calculating'
        c.current_job_id = job.id
        touch(c)
        return { job_id: job.id, conversation_id: id }
      },
    },

    uploads: {
      async create(file) {
        await wait()
        if (mock.failUpload) throw failure('failure')
        const ticket = clone(entryFlow.upload_ticket) as unknown as ReturnType<Services['uploads']['create']> extends Promise<infer T> ? T : never
        ticket.upload_id = uuid()
        uploads.set(ticket.upload_id, file)
        return ticket
      },
      async put(_ticket, _file, onProgress) {
        await wait()
        if (mock.failUpload) throw failure('failure')
        onProgress?.(1)
      },
      async complete(uploadId) {
        await wait()
        const file = uploads.get(uploadId)
        if (!file) throw failure('not_found')
        const now = new Date().toISOString()
        const conversationId = uuid()
        const job: Job = {
          ...clone(jobsFx.digest_running),
          id: uuid(),
          conversation_id: conversationId,
          status: 'queued',
          stage: null,
          stages: jobsFx.digest_running.stages.map((s) => ({ ...s, state: 'pending' as const })),
          created_at: now,
          finished_at: null,
        }
        jobs.set(job.id, job)
        conversations.set(conversationId, {
          id: conversationId,
          title: file.file_name.replace(/\.[^.]+$/, ''),
          stage: 'digesting',
          group: 'today',
          pinned: false,
          archived: false,
          file_name: file.file_name,
          current_job_id: job.id,
          current_run_id: null,
          created_at: now,
          last_activity_at: now,
          deleted_at: null,
          upload: {
            id: uploadId,
            file_name: file.file_name,
            size_bytes: file.size_bytes,
            content_type: file.content_type,
            status: 'uploaded',
            error_code: null,
            sheets: [],
            selected_sheet: null,
            profile: null,
            uploaded_at: now,
          },
        })
        return { conversation_id: conversationId, job_id: job.id }
      },
      async downloadTemplate() {
        await wait()
        return { blob: new Blob(['mock template'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName: 'plantilla-ventas.xlsx' }
      },
    },

    runs: runsMock,
    chat: createChatService({ controls: chatControls }),

    jobs: {
      async get(id) {
        await wait()
        const job = jobs.get(id)
        if (!job) throw failure('not_found')
        return clone(job)
      },
      async cancel(id) {
        await wait()
        const job = jobs.get(id)
        if (!job) throw failure('not_found')
        job.status = 'cancelled'
        job.finished_at = new Date().toISOString()
        const c = conversations.get(job.conversation_id)
        if (c) {
          c.stage = 'cancelled'
          c.current_job_id = null
        }
        return clone(job)
      },
    },
  }
  return mock
}
