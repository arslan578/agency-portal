// Dashboard has its own sidebar logic... or shares global?
// Assuming Global AppSidebar covers it.
export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex bg-background">
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}
