const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(body || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function getVerificationResult(verificationId: string): Promise<VerificationSummary> {
  return request<VerificationSummary>(`/trustid/results/${verificationId}`)
}

export async function submitVerification(formData: FormData): Promise<SubmitVerificationResult> {
  return request<SubmitVerificationResult>('/trustid/verify', {
    method: 'POST',
    body: formData,
  })
}

export async function createDelegatedVerification(body: {
  applicantId: string
  redirectUrl?: string
  expiryMinutes?: number
}): Promise<DelegatedVerificationResult> {
  return request<DelegatedVerificationResult>('/trustid/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
