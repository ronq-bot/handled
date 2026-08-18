import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ForgotForm } from "../reset-forms";
import { requestResetAction } from "../actions";

export const metadata = { title: "Reset password — Handled" };

export default async function ForgotPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <div className="card p-8">
      <h1 className="display-3">Forgot your password.</h1>
      <p className="mt-2 text-sm text-muted">
        It happens. Tell us the email and we&apos;ll send a link that fixes it.
      </p>

      <div className="mt-7">
        <ForgotForm action={requestResetAction} />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Remembered it after all?{" "}
        <Link href="/login" className="font-semibold text-forest hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
