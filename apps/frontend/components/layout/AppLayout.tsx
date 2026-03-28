export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-full relative">
            <main className="md:pl-72">
                {/* <Header /> */}
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
