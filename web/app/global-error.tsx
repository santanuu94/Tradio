"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#fbeee6] text-[#562135]">
        <div className="text-center p-6 bg-white/70 backdrop-blur rounded-2xl border border-white/60 shadow">
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-600 mb-4">An unexpected error occurred.</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#ff9eaa] text-white rounded-full font-medium shadow hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
