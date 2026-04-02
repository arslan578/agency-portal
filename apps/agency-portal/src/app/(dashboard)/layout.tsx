import { AgencySidebar } from "@/components/layout/AgencySidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-cream overflow-hidden" suppressHydrationWarning>
      <AgencySidebar />
      <div className="flex-1 min-w-0 ml-[232px] flex flex-col overflow-hidden relative z-0 bg-cream" suppressHydrationWarning>
        {children}
      </div>
    </div>
  );
}
