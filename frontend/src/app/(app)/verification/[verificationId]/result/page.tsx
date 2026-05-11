import Link from 'next/link'
import { getVerificationResult } from '@/lib/api'
import { OutcomeBadge, StatusBadge } from '@/components/status-badge'

export default async function VerificationResultPage({
  params,
}: {
  params: Promise<{ verificationId: string }>
}) {
  const { verificationId } = await params
  const summary = await getVerificationResult(verificationId)

  const outcomeConfig = {
    Passed: { bg: 'bg-green-50', border: 'border-green-200', text: 'Identity Verified', sub: 'All checks passed successfully.' },
    NeedsReview: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'Under Review', sub: 'TrustID is reviewing this verification. No action needed.' },
    Failed: { bg: 'bg-red-50', border: 'border-red-200', text: 'Verification Failed', sub: 'One or more checks did not pass.' },
    Pending: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'Still Processing', sub: 'Results are not yet available.' },
  }

  const cfg = outcomeConfig[summary.overallOutcome]

  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Verification Result</h1>
        <p className="mt-1 text-sm font-mono text-[#64748B]">{verificationId}</p>
      </div>

      <div className={`rounded-lg border ${cfg.bg} ${cfg.border} p-8 max-w-md mb-6`}>
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">{cfg.text}</h2>
          <OutcomeBadge outcome={summary.overallOutcome} />
        </div>
        <p className="text-sm text-[#64748B] mb-4">{cfg.sub}</p>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[#64748B]">Status</span>
            <StatusBadge status={summary.status} />
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">Liveness</span>
            <span className="font-medium text-[#0F172A]">
              {summary.isLive ? `Passed (${summary.livenessConfidence}%)` : 'Failed'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 bg-white text-[#374151] text-sm font-medium rounded-md border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
        >
          Return to Dashboard
        </Link>
        {summary.overallOutcome === 'Failed' && (
          <Link
            href="/verification/create"
            className="px-5 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
          >
            Start New Verification
          </Link>
        )}
      </div>
    </div>
  )
}
