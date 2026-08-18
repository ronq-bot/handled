import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = { title: "Page not found — Handled" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="smallcaps-quiet mt-12">404 — Not found</p>
      <h1 className="display-2 mt-4 max-w-xl">
        This page isn&apos;t on the calendar.
      </h1>
      <p className="mt-5 max-w-md text-muted">
        Whatever used to be here has moved on, or the address was never right. Unlike a missed
        birthday, this one is completely recoverable.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Back to the front page
        </Link>
        <Link href="/dashboard" className="btn btn-quiet">
          My dashboard
        </Link>
      </div>
    </div>
  );
}
