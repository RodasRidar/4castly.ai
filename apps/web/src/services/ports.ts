import type {
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

export interface ConversationService {
  list(): Promise<Conversation[]>
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
  templateUrl(): string
}

export interface JobService {
  get(id: string): Promise<Job>
  cancel(id: string): Promise<Job>
}

export interface Services {
  auth: AuthService
  profile: ProfileService
  conversations: ConversationService
  uploads: UploadService
  jobs: JobService
}
