import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";
import { signupAction } from "../actions";

export const metadata = { title: "Get covered — Handled" };

export default async function SignupPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <div className="card p-8">
      <h1 className="display-3">Let&apos;s get you covered.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Account first, then dates. The whole setup takes about twenty minutes and buys you a year of
        looking extremely on top of things.
      </p>

      <div className="mt-7">
        <AuthForm mode="signup" action={signupAction} />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-forest hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
