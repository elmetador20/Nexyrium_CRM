"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "segment" | "pill";

const styles: Record<Variant, { base: string; active: string; idle: string }> = {
  segment: { base: "rounded-lg px-2.5 py-1.5 text-xs font-medium", active: "bg-primary text-white shadow-sm", idle: "text-text-secondary hover:bg-surface-hover hover:text-text-primary" },
  pill: { base: "rounded-full border px-3 py-1 text-xs font-medium", active: "border-primary bg-primary text-white", idle: "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary" },
};

function ChipBody({ children, active, variant }: { children: ReactNode; active: boolean; variant: Variant }) {
  const { pending } = useLinkStatus();
  const s = styles[variant];
  // While the next page loads, the clicked chip switches to its active look at once and shows a spinner.
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-100", s.base, active || pending ? s.active : s.idle, pending && "opacity-90")}>
      {pending ? <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A filter chip / segmented-control link with immediate pending feedback. */
export function FilterChip({ href, active, children, variant = "segment" }: { href: string; active: boolean; children: ReactNode; variant?: Variant }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className="shrink-0 rounded-lg no-underline hover:no-underline focus-visible:outline-primary">
      <ChipBody active={active} variant={variant}>{children}</ChipBody>
    </Link>
  );
}
