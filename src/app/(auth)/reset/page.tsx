import Link from "next/link";
import { ResetForm } from "../reset-forms";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Choose a new password — Handled" };
export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="card p-8">
        <h1 className="display-3">That link is incomplete.</h1>
        <p className="mt-2 text-sm text-muted">
          The reset link didn&apos;t survive the trip — some mail apps break long links in two.
          Request a fresh one and try again.
        </p>
        <Link href="/forgot" className="btn btn-primary mt-6">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h1 className="display-3">Choose a new password.</h1>
      <p className="mt-2 text-sm text-muted">
        This signs out every device — you&apos;ll be the only one holding the new key.
      </p>

      <div className="mt-7">
        <ResetForm token={token} action={resetPasswordAction} />
      </div>
    </div>
  );
}
