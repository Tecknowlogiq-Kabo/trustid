import Link from 'next/link'

export default function DashboardPage() {
  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Dashboard</h1>
        <p className="mt-1 text-sm text-[#64748B]">Manage identity verifications</p>
      </div>

      <div className="flex gap-4 mb-10">
        <Link
          href="/verification/create"
          className="inline-flex items-center px-5 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
        >
          Start Verification
        </Link>
        <Link
          href="/delegation/create"
          className="inline-flex items-center px-5 py-2.5 bg-white text-[#374151] text-sm font-medium rounded-md border border-[#E2E8F0] hover:bg-slate-50 transition-colors"
        >
          Delegate Verification
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-[#E2E8F0] p-16 text-center">
        <p className="text-[#64748B] text-sm">
          No verifications yet. Start a new verification to get going.
        </p>
      </div>
    </div>
  )
}
