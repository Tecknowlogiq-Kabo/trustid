'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitVerification, DocumentType } from '@/lib/api'

const docTypes = [
  { label: 'Passport', value: DocumentType.Passport },
  { label: 'Driving Licence', value: DocumentType.DrivingLicence },
  { label: 'National ID', value: DocumentType.NationalId },
  { label: 'BRP', value: DocumentType.BRP },
  { label: 'Visa', value: DocumentType.Visa },
]

export default function VerificationCreatePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = e.currentTarget
    const data = new FormData(form)

    try {
      const result = await submitVerification(data)
      router.push(`/verification/${result.verificationId}/status`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">New Verification</h1>
        <p className="mt-1 text-sm text-[#64748B]">Upload identity documents to start verification</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-[#E2E8F0] p-8 max-w-xl flex flex-col gap-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="applicantId" className="text-sm font-medium text-[#0F172A]">
            Applicant ID <span className="text-red-500">*</span>
          </label>
          <input
            id="applicantId"
            name="applicantId"
            required
            placeholder="e.g. user-12345"
            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="documentType" className="text-sm font-medium text-[#0F172A]">
            Document Type <span className="text-red-500">*</span>
          </label>
          <select
            id="documentType"
            name="documentType"
            required
            defaultValue=""
            className="w-full h-10 px-3 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
          >
            <option value="" disabled>Select document type</option>
            {docTypes.map(({ label, value }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="frontImage" className="text-sm font-medium text-[#0F172A]">
            Front of ID <span className="text-red-500">*</span>
          </label>
          <input id="frontImage" name="frontImage" type="file" accept="image/*" required
            className="text-sm text-[#374151] file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#EFF6FF] file:text-[#1D4ED8] hover:file:bg-blue-100 cursor-pointer" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="backImage" className="text-sm font-medium text-[#0F172A]">
            Back of ID <span className="text-[#64748B] font-normal text-xs">(if applicable)</span>
          </label>
          <input id="backImage" name="backImage" type="file" accept="image/*"
            className="text-sm text-[#374151] file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#EFF6FF] file:text-[#1D4ED8] hover:file:bg-blue-100 cursor-pointer" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="selfie" className="text-sm font-medium text-[#0F172A]">
            Selfie / Liveness photo <span className="text-red-500">*</span>
          </label>
          <input id="selfie" name="selfie" type="file" accept="image/*" required
            className="text-sm text-[#374151] file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#EFF6FF] file:text-[#1D4ED8] hover:file:bg-blue-100 cursor-pointer" />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Submitting…' : 'Submit Verification'}
          </button>
        </div>
      </form>
    </div>
  )
}
