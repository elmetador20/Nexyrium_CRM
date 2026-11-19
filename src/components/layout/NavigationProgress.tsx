"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * App-wide navigation feedback: a top progress bar plus a dimmed content area from the moment
 * an internal link is clicked or a GET filter form is submitted, until the new page arrives.
 */
function Progress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);
  const timeout = useRef<number | undefined>(undefined);

  // A new URL means the navigation finished.
  const location = pathname + "?" + search;
  const [lastLocation, setLastLocation] = useState(location);
  if (location !== lastLocation) { setLastLocation(location); setActive(false); }

  useEffect(() => {
    document.documentElement.toggleAttribute("data-navigating", active);
    window.clearTimeout(timeout.current);
    if (active) timeout.current = window.setTimeout(() => setActive(false), 20000);
  }, [active]);

  useEffect(() => {
    const start = (url: URL) => {
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page / hash only
      setActive(true);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      start(new URL(anchor.href));
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (event.defaultPrevented || (form.method || "get").toLowerCase() !== "get") return;
      const action = form.getAttribute("action");
      if (action && action.startsWith("javascript:")) return;
      start(new URL(action || window.location.pathname, window.location.href));
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("submit", onSubmit); };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div className={active ? "nx-progress-bar h-full bg-accent" : "h-full w-0"} />
    </div>
  );
}

export function NavigationProgress() {
  return <Suspense fallback={null}><Progress /></Suspense>;
}
