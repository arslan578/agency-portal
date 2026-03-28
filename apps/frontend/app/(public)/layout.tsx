export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="p-6">
                <div className="font-bold text-2xl tracking-tight">Kaivo</div>
            </header>
            <main className="flex-1 flex items-center justify-center p-4">
                {children}
            </main>
            <footer className="p-6 text-center text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Kaivo Inc.
            </footer>
        </div>
    );
}
