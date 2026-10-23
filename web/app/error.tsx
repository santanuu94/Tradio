"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center p-6 bg-white/70 backdrop-blur rounded-2xl border border-white/60 shadow">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-[#ff9eaa] text-white rounded-full font-medium shadow hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
