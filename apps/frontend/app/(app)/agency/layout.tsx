import { AgencyGuard } from './AgencyGuard';

export default function AgencyLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <AgencyGuard>
            <div className="flex h-full flex-col">
                <main className="flex-1 overflow-y-auto p-0">
                    {children}
                </main>
            </div>
        </AgencyGuard>
    );
}
