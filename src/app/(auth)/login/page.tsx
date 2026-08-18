import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";
import { loginAction } from "../actions";

export const metadata = { title: "Log in — Handled" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await currentUser()) redirect("/dashboard");
  const { reset } = await searchParams;

  return (
    <div className="card p-8">
      <h1 className="display-3">Welcome back.</h1>
      <p className="mt-2 text-sm text-muted">Everything is still exactly where you left it.</p>

      {reset && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-sage/40 bg-sage-tint px-3 py-2 text-sm text-sage-deep"
        >
          New password set. Log in with it below.
        </p>
      )}

      <div className="mt-7">
        <AuthForm mode="login" action={loginAction} />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted">
        <Link href="/forgot" className="hover:text-ink">
          Forgot your password?
        </Link>
        <p>
          No account yet?{" "}
          <Link href="/signup" className="font-semibold text-forest hover:underline">
            Get covered
          </Link>
        </p>
      </div>
    </div>
  );
}
