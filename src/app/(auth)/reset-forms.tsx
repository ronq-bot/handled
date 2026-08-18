"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full py-3" disabled={pending}>
      {pending ? "One second…" : label}
    </button>
  );
}

function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-claret/40 bg-claret-tint px-3 py-2 text-sm text-claret">
      {error}
    </p>
  );
}

export function ForgotForm({
  action,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction] = useActionState(action, {});

  // The confirmation reads the same whether or not the account exists —
  // this form must never confirm which emails have accounts.
  if (state.done) {
    return (
      <p className="rounded-lg border border-sage/40 bg-sage-tint px-3 py-3 text-sm text-sage-deep">
        If that email has an account, a reset link is on its way. It works once and expires in an
        hour.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </div>
      <ErrorNote error={state.error} />
      <Submit label="Send me a reset link" />
    </form>
  );
}

export function ResetForm({
  token,
  action,
}: {
  token: string;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <ErrorNote error={state.error} />
      <Submit label="Set the new password" />
    </form>
  );
}
