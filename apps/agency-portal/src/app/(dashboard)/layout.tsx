import { AgencySidebar } from "@/components/layout/AgencySidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-surface-secondary overflow-hidden" suppressHydrationWarning>
      <AgencySidebar />
      <div className="flex-1 min-w-0 ml-[260px] flex flex-col overflow-hidden relative z-0" suppressHydrationWarning>
        {children}
      </div>
    </div>
  );
}
