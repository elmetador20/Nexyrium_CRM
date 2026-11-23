"use client";

import { NotificationBell } from "@/features/notifications/Bell";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { UserMenu } from "@/components/ui";

interface TopBarProps {
  user: { name?: string | null; email: string; avatar?: string | null };
  permissions?: string[];
}

const QUICK_CREATE = [
  { label: "Lead", href: "/crm/leads/new", permission: "crm:leads:create" },
  { label: "Client", href: "/crm/clients/new", permission: "crm:clients:create" },
  { label: "Deal", href: "/crm/deals/new", permission: "crm:deals:create" },
  { label: "Invoice", href: "/finance/invoices/new", permission: "invoices:create" },
  { label: "Expense", href: "/expenses/new", permission: "expenses:create" },
  { label: "Project", href: "/projects/new", permission: "projects:create" },
];

const TITLES: Array<[string, string]> = [
  ["/dashboard", "Overview"], ["/crm/leads", "Leads"], ["/crm/clients", "Clients"], ["/crm/contacts", "Contacts"],
  ["/crm/pipeline", "Pipeline"], ["/crm/deals", "Deals"], ["/finance/invoices", "Invoices"], ["/finance/payments", "Payments"],
  ["/finance", "Revenue"], ["/expenses", "Expenses"], ["/quotations", "Quotations"], ["/tasks", "Tasks"], ["/projects", "Projects"],
  ["/activities", "Activities"], ["/documents", "Documents"], ["/reports", "Reports"], ["/targets", "Targets"], ["/people", "People"],
  ["/settings", "Settings"], ["/search", "Search"],
];

export function TopBar({ user, permissions = [] }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const can = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  const creatable = QUICK_CREATE.filter((item) => can(item.permission));
  const section = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1] ?? "Workspace";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); inputRef.current?.focus(); }
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-2 pl-16 pr-3 sm:gap-3 sm:pr-6 lg:px-8">
        <p className="hidden min-w-0 shrink-0 text-sm font-medium text-text-secondary md:block">
          <span className="text-text-muted">NEXYRIUM</span><span className="mx-2 text-border-strong">/</span><span className="text-text-primary">{section}</span>
        </p>
        <form
          role="search"
          className="relative ml-auto min-w-0 flex-1 md:max-w-md"
          onSubmit={(event) => { event.preventDefault(); const q = query.trim(); if (q) router.push("/search?q=" + encodeURIComponent(q)); }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            aria-label="Search the workspace"
            className="h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-14 text-sm text-text-primary shadow-[0_1px_2px_rgb(24_35_31/4%)] outline-none placeholder:text-text-muted focus:border-secondary focus:ring-[3px] focus:ring-primary-light"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-muted px-1.5 text-[0.65rem] font-medium text-text-muted sm:block">Ctrl K</kbd>
        </form>
        {creatable.length ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button type="button" className="button-primary inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium" aria-label="Create new record" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              <Plus className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">New</span>
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg nx-fade-up">
                {creatable.map((item) => (
                  <Link key={item.href} role="menuitem" href={item.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary">New {item.label.toLowerCase()}</Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <NotificationBell />
        <UserMenu user={user} permissions={permissions} />
      </div>
    </header>
  );
}
