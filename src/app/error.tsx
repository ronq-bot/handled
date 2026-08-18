"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The branded crash page. No stack traces, no jargon — the reader is a
 * member mid-task, and the two useful moves are "try again" and "go home".
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server logs carry the real detail; the digest ties this view to them.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="smallcaps-quiet">Something broke</p>
      <h1 className="display-2 mt-4 max-w-xl">That wasn&apos;t supposed to happen.</h1>
      <p className="mt-5 max-w-md text-muted">
        The error is on our side, not yours — nothing you scheduled has been lost, and no order
        went in twice. Try once more; if it keeps happening, come back in a few minutes.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="btn btn-quiet">
          Back to the dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 font-mono text-xs text-faint">Reference {error.digest}</p>
      )}
    </div>
  );
}
