"use client";

export default function AuthenticatedError({ reset, error }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;
  return <div className="card border-danger-light p-8"><h2 className="font-semibold text-text-primary">This page could not load</h2><p className="mt-2 text-sm text-text-secondary">Try again. If the problem continues, contact an administrator.</p><button className="button-primary mt-5" type="button" onClick={reset}>Try again</button></div>;
}
