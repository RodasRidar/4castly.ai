import type {
  ChatMessage,
  ChatStreamEvent,
  ExportFile,
  ExportRequest,
  Feedback,
  FeedbackValue,
  MessageCreate,
  ProductDetail,
  ProductOverrides,
  ProductPage,
  ProductSort,
  RiskLevel,
  AbcClass,
  RunParameters,
  RunSummary,
  SimulationRequest,
  SimulationResult,
  SortOrder,
  ConversationDetail,
  Conversation,
  ConversationUpdate,
  ForecastRequest,
  Job,
  JobAccepted,
  PlanConfirmation,
  PlanView,
  Preferences,
  ProfileUpdate,
  UploadCompleted,
  UploadCreate,
  UploadTicket,
  User,
} from './types'

/**
 * Service ports used by containers (plan section 8). Swapping mock for http is one provider change per service.
 * Every method rejects with `ApiFailure`.
 */

export interface AuthService {
  /** True when there is a signed-in session. Never rejects for "not signed in". */
  hasSession(): Promise<boolean>
  /** Supabase `signInWithOtp({ shouldCreateUser: false })`. Resolves for every well-formed email (no enumeration). */
  requestCode(email: string): Promise<void>
  /** Supabase `verifyOtp`. Rejects with `invalid_code` for a wrong or expired code. */
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}

export interface ProfileService {
  getMe(): Promise<User>
  updateMe(patch: ProfileUpdate): Promise<User>
  getPreferences(): Promise<Preferences>
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>
}

export interface ConversationQuery {
  q?: string
  includeArchived?: boolean
  cursor?: string | null
  limit?: number
}

export interface ConversationsPage {
  items: Conversation[]
  nextCursor: string | null
}

export interface ConversationService {
  /** First page for the sidebar (non-archived, newest first). */
  list(): Promise<Conversation[]>
  /** Full history: text search, archived ones on request, cursor paging. */
  search(query?: ConversationQuery): Promise<ConversationsPage>
  get(id: string): Promise<ConversationDetail>
  update(id: string, patch: ConversationUpdate): Promise<Conversation>
  remove(id: string): Promise<void>
  restore(id: string): Promise<Conversation>
  getPlan(id: string): Promise<PlanView>
  confirmPlan(id: string, confirmation: PlanConfirmation): Promise<PlanView>
  startForecast(id: string, request: ForecastRequest): Promise<JobAccepted>
}

export interface UploadService {
  create(file: UploadCreate): Promise<UploadTicket>
  /** Direct browser upload to the signed URL (the API never receives the file). */
  put(ticket: UploadTicket, file: File, onProgress?: (fraction: number) => void): Promise<void>
  complete(uploadId: string): Promise<UploadCompleted>
  /** The sales template, fetched with the session token (the endpoint is not public). */
  downloadTemplate(): Promise<{ blob: Blob; fileName: string }>
}

export interface JobService {
  get(id: string): Promise<Job>
  cancel(id: string): Promise<Job>
}

export interface ProductQuery {
  q?: string
  risk?: RiskLevel[]
  abc?: AbcClass[]
  sort?: ProductSort
  order?: SortOrder
  page?: number
  pageSize?: number
}

export interface RunService {
  summary(runId: string): Promise<RunSummary>
  products(runId: string, query?: ProductQuery): Promise<ProductPage>
  product(runId: string, code: string): Promise<ProductDetail>
  /** What-if for lead time, coverage and the purchase toggle. No re-forecast. */
  simulate(runId: string, code: string, request: SimulationRequest): Promise<SimulationResult>
  updateParameters(runId: string, parameters: RunParameters): Promise<RunParameters>
  /** Starts a forecast job; the conversation goes back to `calculating` until it settles. */
  recalculate(runId: string): Promise<JobAccepted>
  setOverrides(code: string, overrides: ProductOverrides): Promise<ProductOverrides>
  createExport(runId: string, request: ExportRequest): Promise<ExportFile>
}

export interface ChatService {
  list(conversationId: string): Promise<ChatMessage[]>
  /** Token-by-token stream (SSE in the real implementation). Aborting ends it with `stop_reason: cancelled`. */
  send(conversationId: string, message: MessageCreate, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>
  retry(messageId: string, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>
  feedback(messageId: string, value: FeedbackValue | null): Promise<Feedback>
}

export interface Services {
  auth: AuthService
  profile: ProfileService
  conversations: ConversationService
  uploads: UploadService
  jobs: JobService
  runs: RunService
  chat: ChatService
}
