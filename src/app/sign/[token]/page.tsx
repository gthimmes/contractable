import { getSignatureByToken, isSignatureExpired } from "@/lib/signing";
import { SignatureCapture } from "@/components/SignatureCapture";
import { declineAction } from "@/app/actions";
import { formatDateTime } from "@/components/ui";

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sig = await getSignatureByToken(token);

  if (!sig) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Invalid signing link</h1>
        <p className="mt-2 text-sm text-gray-500">
          This link is not valid. Please request a new one.
        </p>
      </Centered>
    );
  }

  if (isSignatureExpired(sig)) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">This signing link has expired</h1>
        <p className="mt-2 text-sm text-gray-500">
          For security, signing links for “{sig.contract.title}” are valid for a
          limited time. Ask the sender to re-issue your link — you&apos;ll get a
          fresh one by email.
        </p>
      </Centered>
    );
  }

  if (sig.status !== "PENDING") {
    return (
      <Centered>
        <div
          className={`mb-3 grid h-12 w-12 place-items-center rounded-full text-2xl ${
            sig.status === "SIGNED"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {sig.status === "SIGNED" ? "✓" : "✕"}
        </div>
        <h1 className="text-xl font-semibold">
          {sig.status === "SIGNED" ? "Signed" : "Declined"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {sig.signerName}, you {sig.status.toLowerCase()} “{sig.contract.title}”
          {sig.signedAt && <> on {formatDateTime(sig.signedAt)}</>}.
        </p>
        {sig.status === "SIGNED" && sig.documentHash && (
          <p className="mt-3 font-mono text-xs text-gray-400">
            Document hash: {sig.documentHash.slice(0, 24)}…
          </p>
        )}
      </Centered>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-500">You have been asked to sign</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {sig.contract.title}
        </h1>
        <p className="text-sm text-gray-500">
          {sig.contract.reference} · signing as{" "}
          <span className="font-medium">{sig.signerName}</span> ({sig.signerEmail})
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Document
          </h2>
          <span className="font-mono text-xs text-gray-400">
            hash {sig.version.contentHash.slice(0, 12)}…
          </span>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
          {sig.version.body}
        </pre>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Your signature
        </h2>
        <SignatureCapture token={token} defaultName={sig.signerName} />
      </div>

      <form action={declineAction} className="flex items-center justify-center gap-2">
        <input type="hidden" name="token" value={token} />
        <input
          name="reason"
          placeholder="Reason (optional)"
          className="input max-w-xs"
        />
        <button className="btn-secondary text-red-600">Decline to sign</button>
      </form>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      {children}
    </div>
  );
}
