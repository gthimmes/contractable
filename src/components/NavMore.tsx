"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface NavItem {
  href: string;
  label: string;
}

/** "More ▾" dropdown for secondary nav destinations. */
export function NavMore({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        More ▾
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
