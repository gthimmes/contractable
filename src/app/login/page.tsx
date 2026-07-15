import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loginAction } from "@/app/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (await getSessionUser()) redirect("/");

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
              Invalid email or password.
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
            <label className="label">Password</label>
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
