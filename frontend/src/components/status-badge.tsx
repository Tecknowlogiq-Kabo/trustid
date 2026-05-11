import type { VerificationStatus, VerificationOutcome } from '@/lib/api'

const statusStyles: Record<VerificationStatus, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Submitted: 'bg-blue-100 text-blue-700',
  Complete: 'bg-green-100 text-green-700',
}

const outcomeStyles: Record<VerificationOutcome, string> = {
  Passed: 'bg-green-100 text-green-700',
  NeedsReview: 'bg-amber-100 text-amber-700',
  Failed: 'bg-red-100 text-red-700',
  Pending: 'bg-slate-100 text-slate-600',
}

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}>
      {status}
    </span>
  )
}

export function OutcomeBadge({ outcome }: { outcome: VerificationOutcome }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${outcomeStyles[outcome]}`}>
      {outcome}
    </span>
  )
}
