import { AppSidebar } from '@/components/layout/AppSidebar';

export default function TermsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex bg-background min-h-screen">
            <AppSidebar />
            <div className="flex-1 flex flex-col min-h-screen transition-all duration-300 ml-64">
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
