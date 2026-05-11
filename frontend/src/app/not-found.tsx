import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-4 max-w-md px-6">
        <span className="text-8xl font-bold text-[#CBD5E1]">404</span>
        <h1 className="text-2xl font-semibold text-[#0F172A]">Page not found</h1>
        <p className="text-sm text-[#64748B]">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-2 px-6 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
