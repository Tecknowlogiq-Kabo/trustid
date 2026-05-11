import type {
  DelegatedVerificationResult,
  SubmitVerificationResult,
  VerificationSummary,
} from './types'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export const trustidApi = createApi({
  reducerPath: 'trustidApi',
  baseQuery: fetchBaseQuery({ baseUrl }),
  endpoints: (builder) => ({
    getVerificationResult: builder.query<VerificationSummary, string>({
      query: (verificationId) => `/trustid/results/${verificationId}`,
    }),

    submitVerification: builder.mutation<SubmitVerificationResult, FormData>({
      query: (body) => ({
        url: '/trustid/verify',
        method: 'POST',
        body,
      }),
    }),

    createDelegatedVerification: builder.mutation<
      DelegatedVerificationResult,
      { applicantId: string; redirectUrl?: string; expiryMinutes?: number }
    >({
      query: (body) => ({
        url: '/trustid/session',
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
  }),
})

export function rtkErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (typeof error === 'object') {
    if ('error' in error && typeof error.error === 'string') return error.error
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('data' in error && error.data != null) return String(error.data)
  }
  return 'An error occurred'
}

export const {
  useGetVerificationResultQuery,
  useSubmitVerificationMutation,
  useCreateDelegatedVerificationMutation,
} = trustidApi
