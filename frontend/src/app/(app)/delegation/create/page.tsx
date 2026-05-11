'use client'

import { useRouter } from 'next/navigation'
import { useCreateDelegatedVerificationMutation, rtkErrorMessage } from '@/lib/trustidApi'

export default function DelegationCreatePage() {
  const router = useRouter()
  const [createDelegatedVerification, { isLoading, error }] = useCreateDelegatedVerificationMutation()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    try {
      const result = await createDelegatedVerification({}).unwrap()
      router.push(
        `/delegation/${result.verificationId}/success?url=${encodeURIComponent(result.guestLinkUrl)}&expires=${encodeURIComponent(result.expiresAt)}`
      )
    } catch {
      // RTK Query surfaces error in the `error` property
    }
  }

  const errorMessage = rtkErrorMessage(error)

  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Delegated Verification</h1>
        <p className="mt-1 text-sm text-[#64748B]">Generate a guest link for the applicant to complete verification externally</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-[#E2E8F0] p-8 max-w-xl flex flex-col gap-6">
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-fit px-5 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Generating…' : 'Generate Guest Link'}
        </button>
      </form>
    </div>
  )
}
