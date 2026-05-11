'use client'

import Link from 'next/link'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-4 max-w-md px-6">
        <span className="text-8xl font-bold text-[#CBD5E1]">500</span>
        <h1 className="text-2xl font-semibold text-[#0F172A]">Something went wrong</h1>
        <p className="text-sm text-[#64748B]">
          An unexpected error occurred. Our team has been notified.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 bg-white text-[#374151] text-sm font-medium rounded-md border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
