"use client";

/**
 * A submit button that asks for confirmation before allowing its parent form to
 * submit — used to guard destructive actions (delete). Keeps deletes as real
 * server-action form submissions while preventing accidental clicks.
 */
export function ConfirmSubmit({
  message,
  children,
  className = "btn-danger",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
