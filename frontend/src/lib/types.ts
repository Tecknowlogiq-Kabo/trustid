export type VerificationStatus = 'Draft' | 'Submitted' | 'Complete'
export type VerificationOutcome = 'Passed' | 'NeedsReview' | 'Failed' | 'Pending'

export interface VerificationSummary {
  verificationId: string
  status: VerificationStatus
  overallOutcome: VerificationOutcome
  isLive: boolean
  livenessConfidence: number
  retrievedAt: string
}

export interface SubmitVerificationResult {
  verificationId: string
  publishedAt: string
}

export interface DelegatedVerificationResult {
  verificationId: string
  guestLinkUrl: string
  expiresAt: string
}

export const DocumentType = {
  Passport: 1,
  DrivingLicence: 2,
  NationalId: 3,
  BRP: 4,
  Visa: 5,
} as const
