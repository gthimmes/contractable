import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";

// Public page: request a password set/reset link. Also serves as the invite
// completion path for users an admin created without a password.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white">
            C
          </span>
          <span className="text-xl font-semibold tracking-tight">Contractable</span>
        </div>

        {sent ? (
          <div className="card space-y-3 p-6">
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="text-sm text-gray-600">
              If an account exists for that address, a password link is on its
              way. It's valid for one hour and can be used once.
            </p>
            <p className="text-xs text-gray-400">
              (In this demo, delivery also lands in the staff <b>Outbox</b> and
              the server console.)
            </p>
            <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form action={requestPasswordResetAction} className="card space-y-4 p-6">
            <h1 className="text-lg font-semibold">Reset your password</h1>
            <p className="text-sm text-gray-600">
              Enter your account email and we'll send a link to set a new
              password.
            </p>
            <div>
              <label className="label">Email</label>
              <input
                name="email"
                type="email"
                required
                autoFocus
                className="input"
                placeholder="you@company.example"
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Send reset link
            </button>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-brand-600 hover:underline"
            >
              ← Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
