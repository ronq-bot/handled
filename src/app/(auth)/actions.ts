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

export type AuthState = { error?: string; done?: boolean };

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "We need something to call you." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (await findUserByEmail(email)) return { error: "That email already has an account. Try logging in." };

  const user = await createUser(email, password, name);
  await startSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

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

  const user = await findUserByEmail(email);
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
