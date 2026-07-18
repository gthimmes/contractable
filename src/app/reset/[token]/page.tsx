import Link from "next/link";
import { validateResetToken } from "@/lib/reset";
import { resetPasswordAction } from "@/app/actions";

const ERROR_MESSAGES: Record<string, string> = {
  short: "Password must be at least 8 characters.",
  mismatch: "The two passwords don't match.",
  invalid: "This link is no longer valid — request a new one.",
};

// Public page: complete a password set/reset from an emailed single-use link.
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const valid = await validateResetToken(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white">
            C
          </span>
          <span className="text-xl font-semibold tracking-tight">Contractable</span>
        </div>

        {!valid ? (
          <div className="card space-y-3 p-6">
            <h1 className="text-lg font-semibold">Link expired</h1>
            <p className="text-sm text-gray-600">
              This password link is invalid, already used, or older than one
              hour.
            </p>
            <Link href="/forgot" className="text-sm font-medium text-brand-600 hover:underline">
              Request a new link →
            </Link>
          </div>
        ) : (
          <form action={resetPasswordAction} className="card space-y-4 p-6">
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-sm text-gray-600">
              Signing in as <b>{valid.user.email}</b>. All existing sessions
              will be signed out.
            </p>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {ERROR_MESSAGES[error] ?? "Something went wrong. Try again."}
              </p>
            )}

            <input type="hidden" name="token" value={token} />
            <div>
              <label className="label">New password</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoFocus
                className="input"
              />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input name="confirm" type="password" required minLength={8} className="input" />
            </div>
            <button type="submit" className="btn-primary w-full">
              Set password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
