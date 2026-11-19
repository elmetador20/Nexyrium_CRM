"use client";

import Link from "next/link";
import { useId, useRef, useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, User, Settings, LogOut } from "lucide-react";
import { Avatar } from "./Avatar";

export interface DropdownItem {
  label?: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode | ((props: { open: boolean; onClick: () => void; menuId: string }) => ReactNode);
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({ trigger, items, align = "right", className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const focusTrigger = () => {
    rootRef.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus();
  };

  const close = () => {
    setOpen(false);
    window.setTimeout(focusTrigger, 0);
  };

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      const items = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'),
      );
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (items.length === 0) return;

      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (currentIndex + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[nextIndex]?.focus();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    }, 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const triggerContent = typeof trigger === "function"
    ? trigger({ open, onClick: () => setOpen((current) => !current), menuId })
    : (
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="btn btn-ghost btn-sm flex items-center gap-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Open menu"
      >
        {trigger}
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
    );

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      {triggerContent}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className={`absolute z-50 mt-2 min-w-[180px] rounded-lg border border-border bg-surface shadow-lg animate-in ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="menu"
        >
          <div className="py-1.5">
            {items.map((item, index) => {
              if (item.divider) {
                return <hr key={`divider-${index}`} className="divider my-1.5" role="separator" />;
              }

              const itemClassName = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                item.disabled
                  ? "text-text-muted"
                  : item.danger
                    ? "text-danger hover:bg-danger-light"
                    : "text-text-primary hover:bg-surface-hover"
              }`;

              if (item.disabled) {
                return (
                  <span key={index} className={itemClassName} role="menuitem" aria-disabled="true">
                    {item.icon && <span className="h-4 w-4 flex-shrink-0" aria-hidden="true">{item.icon}</span>}
                    {item.label}
                  </span>
                );
              }

              const content = (
                <>
                  {item.icon && <span className="h-4 w-4 flex-shrink-0" aria-hidden="true">{item.icon}</span>}
                  {item.label}
                </>
              );

              if (item.href) {
                const handleClick = () => {
                  item.onClick?.();
                  setOpen(false);
                };

                return item.href.startsWith("/") ? (
                  <Link
                    key={index}
                    href={item.href}
                    className={itemClassName}
                    role="menuitem"
                    tabIndex={-1}
                    onClick={handleClick}
                  >
                    {content}
                  </Link>
                ) : (
                  <a
                    key={index}
                    href={item.href}
                    className={itemClassName}
                    role="menuitem"
                    tabIndex={-1}
                    onClick={handleClick}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                  className={itemClassName}
                  role="menuitem"
                  tabIndex={-1}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface UserMenuProps {
  user: {
    name?: string | null;
    email: string;
    avatar?: string | null;
  };
  permissions?: string[];
}

export function UserMenu({ user, permissions = [] }: UserMenuProps) {
  const router = useRouter();
  const canManageSettings = permissions.includes("*") || permissions.includes("settings:read");

  const handleSignOut = () => {
    router.push("/logout");
  };

  return (
    <Dropdown
      trigger={({ open, onClick, menuId }) => (
        <button
          type="button"
          className="btn btn-ghost btn-sm flex items-center gap-2"
          aria-label="User menu"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={onClick}
        >
          <Avatar src={user.avatar} name={user.name || user.email.split("@")[0]} size="sm" />
          <span className="hidden max-w-[12rem] truncate font-medium text-text-primary sm:block">{user.name || user.email.split("@")[0]}</span>
        </button>
      )}
      items={[
        { label: "Profile", href: "/settings/profile", icon: <User className="h-4 w-4" /> },
        ...(canManageSettings
          ? [{ label: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" /> }]
          : []),
        { divider: true },
        { label: "Sign out", onClick: handleSignOut, danger: true, icon: <LogOut className="h-4 w-4" /> },
      ]}
      align="right"
    />
  );
}
