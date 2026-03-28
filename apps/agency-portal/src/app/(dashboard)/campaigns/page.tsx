export default function CampaignsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground mt-1">Monitor and manage all client campaigns</p>
      </div>
      <div className="glass-card rounded-2xl border p-16 flex flex-col items-center justify-center text-center">
        <div className="h-16 w-16 bg-kaivo-amber/10 rounded-2xl border border-kaivo-amber/20 flex items-center justify-center mb-4">
          <span className="text-3xl">⚡</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Campaign Management</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Campaign tracking and launch controls are being wired in Milestone 2.
        </p>
      </div>
    </div>
  );
}
