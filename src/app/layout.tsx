import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contractable — Contract Lifecycle Management",
  description:
    "Draft, route for review and approval, sign, store, and enforce contracts.",
};

// Root layout is intentionally minimal so public routes (/login, /sign) render
// without the app chrome. The authenticated shell lives in (app)/layout.tsx.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
