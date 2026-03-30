'use client';

import { usePathname } from "next/navigation";

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "Portfolio Dashboard" },
  "/clients": { title: "Clients" },
  "/settings": { title: "Settings" },
  "/integrations": { title: "Integrations" },
  "/insights": { title: "AI Insights" },
  "/reports": { title: "Reporting" },
  "/billing": { title: "Billing" },
  "/onboarding": { title: "Get Started" },
};

export function DashboardHeader({
  title,
  subtitle,
  actions,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta =
    PAGE_META[pathname] ||
    (pathname?.match(/^\/agency\/\d+\/clients\/?$/) ? { title: "Clients" } : null) ||
    { title: "Kaivo" };
  const displayTitle = title || meta.title;
  const displaySubtitle = subtitle || meta.subtitle;

  return (
    <header className="h-16 bg-white border-b border-border flex items-center px-7 gap-4 shrink-0">
      <div>
        <h1 className="text-[16px] font-bold text-text-primary tracking-tight">{displayTitle}</h1>
        {displaySubtitle && (
          <p className="text-[12px] text-text-muted font-medium -mt-0.5">{displaySubtitle}</p>
        )}
      </div>
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </header>
  );
}
