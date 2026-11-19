"use client";

import { type HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "success" | "warning" | "danger" | "neutral";
  size?: "sm" | "md";
  dot?: boolean;
}

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  className = "",
  ...props
}: BadgeProps) {
  const variantClasses = {
    primary: "badge-primary",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    neutral: "badge-neutral",
  }[variant];

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[0.6875rem]",
    md: "px-2 py-0.5 text-xs",
  }[size];

  return (
    <span
      className={`badge ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${size === "sm" && "w-1 h-1"}`}
          style={{ backgroundColor: "currentColor" }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
