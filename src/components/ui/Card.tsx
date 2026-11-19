"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "default" | "bordered" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
  title?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, title, variant = "default", padding = "md", className = "", ...props }, ref) => {
    const variantClasses = {
      default: "card",
      bordered: "card border-border-strong",
      elevated: "card shadow-md",
    }[variant];

    const paddingClasses = {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
    }[padding];

    return (
      <div ref={ref} className={`${variantClasses} ${title ? "overflow-hidden" : ""} ${className}`} {...props}>
        {title ? (
          <CardHeader>
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          </CardHeader>
        ) : null}
        <div className={paddingClasses}>{children}</div>
      </div>
    );
  }
);

Card.displayName = "Card";

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`px-5 py-4 border-b border-border ${className}`} {...props}>
      {children}
    </div>
  )
);

CardHeader.displayName = "CardHeader";

export type CardBodyProps = HTMLAttributes<HTMLDivElement>;

export const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  )
);

CardBody.displayName = "CardBody";

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className = "", ...props }, ref) => (
    <div ref={ref} className={`px-5 py-4 border-t border-border bg-surface-hover rounded-b-lg ${className}`} {...props}>
      {children}
    </div>
  )
);

CardFooter.displayName = "CardFooter";
