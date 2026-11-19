"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "square";
}

export function Avatar({
  src,
  alt,
  name,
  size = "md",
  shape = "circle",
  className = "",
  ...props
}: AvatarProps) {
  const sizeClasses = {
    xs: "h-6 w-6 text-[0.625rem]",
    sm: "h-8 w-8 text-[0.75rem]",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-16 w-16 text-lg",
  }[size];

  const shapeClasses = shape === "circle" ? "rounded-full" : "rounded-lg";
  // Google profile photos are refused when a referrer is sent; fall back to initials if the image still fails.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getColorFromName = (name: string) => {
    const colors = [
      // Brand-only tones
      "bg-primary text-white",
      "bg-secondary text-white",
      "bg-accent text-white",
      "bg-primary-light text-primary",
      "bg-accent-light text-[#B4612A]",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (src && failedSrc !== src) {
    return (
      <div
        className={`relative inline-block overflow-hidden ${sizeClasses} ${shapeClasses} ${className}`}
        {...props}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external avatar, needs referrerPolicy + error fallback */}
        <img
          src={src}
          alt={alt || name || "Avatar"}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center font-medium ${sizeClasses} ${shapeClasses} ${getColorFromName(name || "User")} ${className}`}
      aria-label={name || alt || "User avatar"}
      {...props}
    >
      {name ? getInitials(name) : "?"}
    </div>
  );
}

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  max?: number;
  size?: AvatarProps["size"];
}

export function AvatarGroup({
  children,
  max = 5,
  size = "md",
  className = "",
  ...props
}: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visibleChildren = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={`flex -space-x-2 ${className}`} {...props}>
      {visibleChildren.map((child, index) => (
        <span key={index} className="relative z-[auto]">
          {index === visibleChildren.length - 1 && remainingCount > 0 ? (
            <div className="relative z-10">
              {child}
            </div>
          ) : (
            <div className={`relative ${index > 0 ? "z-10" : ""}`}>{child}</div>
          )}
        </span>
      ))}
      {remainingCount > 0 && (
        <Avatar
          name={`+${remainingCount}`}
          size={size}
          className="bg-surface border-2 border-background"
        />
      )}
    </div>
  );
}
