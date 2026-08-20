"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { HelpNavigator } from "help-navigator";
import { helpContent } from "@/help/content";
import { helpArticlesFor } from "@/help/context";

// Mounts the in-app help center (floating launcher bottom-right, F1 to
// toggle) and keeps "Suggested for this page" in sync with the route.
export function HelpWidget() {
  const pathname = usePathname();
  const helpRef = useRef<HelpNavigator | null>(null);

  useEffect(() => {
    const help = HelpNavigator.init({
      content: helpContent,
      theme: "light",
      accentColor: "#2a54d4",
      position: "bottom-right",
      hotkey: "F1",
      texts: { panelTitle: "Contractable Help" },
    });
    helpRef.current = help;
    return () => {
      helpRef.current = null;
      help.destroy();
    };
  }, []);

  useEffect(() => {
    helpRef.current?.setContext(helpArticlesFor(pathname ?? "/"));
  }, [pathname]);

  return null;
}
