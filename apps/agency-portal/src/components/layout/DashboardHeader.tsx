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
    <header className="h-[56px] bg-white border-b-2 border-cream-border flex items-center px-6 gap-3 shrink-0">
      <div>
        <div className="text-[15px] font-extrabold text-text-primary">{displayTitle}</div>
        {displaySubtitle && (
          <div className="text-[12px] text-text-muted font-medium">{displaySubtitle}</div>
        )}
      </div>
      {actions && <div className="ml-auto flex items-center gap-[10px]">{actions}</div>}
    </header>
  );
}
