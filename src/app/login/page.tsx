import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { googleConfigFromEnv, oidcEnvConfigured } from "@/lib/oauth";
import { loginAction } from "@/app/actions";

const ERROR_MESSAGES: Record<string, string> = {
  "1": "Invalid email or password.",
  rate: "Too many attempts for this account. Wait a few minutes and try again.",
  sso: "Google sign-in failed. Please try again.",
  sso_no_account: "No Contractable account matches that Google account. Ask an admin to add you.",
  sso_unconfigured: "Google sign-in is not configured on this server.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  if (await getSessionUser()) redirect("/");
  const ssoEnabled = googleConfigFromEnv() !== null;
  const oidc = oidcEnvConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white">
            C
          </span>
          <span className="text-xl font-semibold tracking-tight">Contractable</span>
        </div>

        <form action={loginAction} className="card space-y-4 p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}
            </p>
          )}
          {reset && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Password updated — sign in with your new password.
            </p>
          )}

          <div>
            <label className="label">Email</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="input"
              placeholder="alice@acme.example"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Password</label>
              <a href="/forgot" className="text-xs font-medium text-brand-600 hover:underline">
                Forgot password?
              </a>
            </div>
            <input
              name="password"
              type="password"
              required
              className="input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>

          {(ssoEnabled || oidc) && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                or
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              {oidc && (
                <a
                  href="/auth/oidc"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-gray-800 text-[10px] font-bold text-white">
                    →
                  </span>
                  Sign in with {oidc.name}
                </a>
              )}
              {ssoEnabled && (
              <a
                href="/auth/google"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {/* Google "G" mark */}
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                  <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
                  <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.7-13.6-9.2l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
                </svg>
                Sign in with Google
              </a>
              )}
            </>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Demo accounts — password <code className="font-mono">password</code>:<br />
          <span className="font-mono">alice@acme.example</span> (admin),{" "}
          <span className="font-mono">larry@acme.example</span> (legal),{" "}
          <span className="font-mono">mona@acme.example</span> (manager),{" "}
          <span className="font-mono">vic@acme.example</span> (viewer)
        </p>
      </div>
    </div>
  );
}
