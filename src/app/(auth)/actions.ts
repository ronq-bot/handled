"use server";

import { redirect } from "next/navigation";
import {
  createResetToken,
  createUser,
  endSession,
  findUserByEmail,
  resetPasswordWithToken,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { emailPasswordReset } from "@/lib/email";
import { env } from "@/lib/env";
import { allowAttempt } from "@/lib/rate-limit";

export type AuthState = { error?: string; done?: boolean };

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "We need something to call you." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (!(await allowAttempt(`signup:${email.toLowerCase()}`, 5, 60 * 60))) {
    return { error: "Too many attempts with this email. Give it an hour." };
  }
  if (await findUserByEmail(email)) return { error: "That email already has an account. Try logging in." };

  const user = await createUser(email, password, name);
  await startSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Keyed to the account under attack, not the caller: a credential grind
  // against one email locks that email, wherever the guesses come from.
  if (!(await allowAttempt(`login:${email.toLowerCase()}`, 10, 15 * 60))) {
    return {
      error: "Too many attempts for this account. Wait fifteen minutes, or reset your password.",
    };
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Wrong email or password." };
  }

  await startSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

/**
 * Always answers the same way, found or not — the response must not reveal
 * which emails have accounts. The real work only happens for a match.
 */
export async function requestResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email doesn't look right." };
  }

  // Over the allowance we still answer "sent" — the limiter must not become
  // an account-existence oracle — we just quietly stop mailing, which is the
  // mail-bombing protection.
  const withinAllowance = await allowAttempt(`forgot:${email.toLowerCase()}`, 3, 15 * 60);

  const user = withinAllowance ? await findUserByEmail(email) : null;
  if (user) {
    const token = await createResetToken(user.id);
    await emailPasswordReset({
      to: user.email,
      firstName: user.name.split(" ")[0] || "there",
      resetUrl: `${env.appUrl}/reset?token=${token}`,
    });
  }
  return { done: true };
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters." };

  const ok = await resetPasswordWithToken(token, password);
  if (!ok) {
    return { error: "That reset link is no good — expired, already used, or mistyped. Request a fresh one." };
  }
  redirect("/login?reset=1");
}
