import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";
import { loginAction } from "../actions";

export const metadata = { title: "Log in — Handled" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <div className="card p-8">
      <h1 className="display-3">Welcome back.</h1>
      <p className="mt-2 text-sm text-muted">Everything is still exactly where you left it.</p>

      <div className="mt-7">
        <AuthForm mode="login" action={loginAction} />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-semibold text-forest hover:underline">
          Get covered
        </Link>
      </p>
    </div>
  );
}
