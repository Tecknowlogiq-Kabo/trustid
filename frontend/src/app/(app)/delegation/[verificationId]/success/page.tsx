'use client'

import { use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SuccessContent({ verificationId }: { verificationId: string }) {
  const searchParams = useSearchParams()
  const guestLinkUrl = searchParams.get('url') ?? ''
  const expiresAt = searchParams.get('expires') ?? ''

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  async function copyLink() {
    await navigator.clipboard.writeText(guestLinkUrl)
  }

  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Guest Link Created</h1>
        <p className="mt-1 text-sm font-mono text-[#64748B]">{verificationId}</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-8 max-w-xl mb-6">
        <p className="text-sm font-semibold text-green-800 mb-4">Link generated successfully</p>

        <div className="flex items-center gap-2 bg-white rounded-md border border-green-100 px-4 py-3 mb-3">
          <span className="flex-1 text-sm text-[#374151] font-mono truncate">{guestLinkUrl || '—'}</span>
          {guestLinkUrl && (
            <button
              onClick={copyLink}
              className="shrink-0 text-xs font-medium text-[#3B82F6] hover:text-blue-700"
            >
              Copy
            </button>
          )}
        </div>

        {expiryLabel && (
          <p className="text-xs text-green-700">This link expires on {expiryLabel}.</p>
        )}
      </div>

      <Link
        href="/"
        className="inline-flex px-5 py-2.5 bg-white text-[#374151] text-sm font-medium rounded-md border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  )
}

export default function DelegationSuccessPage({
  params,
}: {
  params: Promise<{ verificationId: string }>
}) {
  const { verificationId } = use(params)

  return (
    <Suspense>
      <SuccessContent verificationId={verificationId} />
    </Suspense>
  )
}
