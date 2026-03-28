import { AgencySidebar } from "@/components/layout/AgencySidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden" suppressHydrationWarning>
      <AgencySidebar />
      <div className="flex-1 ml-[232px] flex flex-col overflow-hidden" suppressHydrationWarning>
        {children}
      </div>
    </div>
  );
}
