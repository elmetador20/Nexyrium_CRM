export const instant = false;

/** CRM modules are reached from the sidebar; each page renders its own header. */
export default function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
