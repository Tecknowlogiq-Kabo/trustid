'use client'

import { useRouter } from 'next/navigation'
import { use } from 'react'
import { useGetVerificationResultQuery, rtkErrorMessage } from '@/lib/trustidApi'
import { StatusBadge } from '@/components/status-badge'

export default function VerificationStatusPage({
  params,
}: {
  params: Promise<{ verificationId: string }>
}) {
  const { verificationId } = use(params)
  const router = useRouter()

  const { data: summary, error, isLoading } = useGetVerificationResultQuery(
    verificationId,
    { pollingInterval: 3000 }
  )

  const errorMessage = rtkErrorMessage(error)

  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Verification Status</h1>
        <p className="mt-1 text-sm font-mono text-[#64748B]">{verificationId}</p>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3 max-w-md mb-6">
          {errorMessage}
        </div>
      )}

      <div className="bg-white rounded-lg border border-[#E2E8F0] p-8 max-w-md">
        {isLoading && !summary ? (
          <div className="flex items-center gap-3 text-[#64748B]">
            <div className="w-4 h-4 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#0F172A]">Status</span>
              {summary && <StatusBadge status={summary.status} />}
            </div>

            {summary?.status !== 'Complete' && (
              <div className="flex items-center gap-2 text-[#64748B] text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
                Checking for updates every 3 seconds…
              </div>
            )}

            {summary?.status === 'Complete' && (
              <button
                onClick={() => router.push(`/verification/${verificationId}/result`)}
                className="w-full py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
              >
                View Result →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
