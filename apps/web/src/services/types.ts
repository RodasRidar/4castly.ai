import type { components } from './http/schema.gen'

type S = components['schemas']

/** Aliases over the generated contract. Never redefine a shape here: if it is missing, it is a contract request. */
export type ApiError = S['ApiError']
export type Locale = S['Locale']
export type Theme = S['Theme']
export type User = S['User']
export type Preferences = S['Preferences']
export type ProfileUpdate = S['ProfileUpdate']
export type Conversation = S['Conversation']
export type ConversationDetail = S['ConversationDetail']
export type ConversationStage = S['ConversationStage']
export type ConversationGroup = S['ConversationGroup']
export type ConversationUpdate = S['ConversationUpdate']
export type Upload = S['Upload']
export type UploadCreate = S['UploadCreate']
export type UploadTicket = S['UploadTicket']
export type UploadCompleted = S['UploadCompleted']
export type UploadErrorCode = S['UploadErrorCode']
export type Job = S['Job']
export type JobStage = S['JobStage']
export type JobAccepted = S['JobAccepted']
export type PlanView = S['PlanView']
export type PlanConfirmation = S['PlanConfirmation']
export type NormalizationPlan = S['NormalizationPlan']
export type ColumnMapping = S['ColumnMapping']
export type MappedField = S['MappedField']
export type DataWarning = S['DataWarning']
export type DataSummary = S['DataSummary']
export type MovementRule = S['MovementRule']
export type DateColumnCandidate = S['DateColumnCandidate']
export type ClarificationPayload = S['ClarificationPayload']
export type ClarificationQuestion = S['ClarificationQuestion']
export type ClarificationAnswers = S['ClarificationAnswers']
export type ForecastRequest = S['ForecastRequest']
export type HadStockouts = S['HadStockouts']

/** Thrown by every service; `problem` is the problem+json body, never shown raw (only `ref` and `message_key`). */
export class ApiFailure extends Error {
  readonly problem: ApiError
  constructor(problem: ApiError) {
    super(problem.code)
    this.name = 'ApiFailure'
    this.problem = problem
  }
}
