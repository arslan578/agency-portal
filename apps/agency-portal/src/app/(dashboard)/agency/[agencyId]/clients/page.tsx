'use client';

/**
 * REST-style alias: /agency/{id}/clients matches backend paths; same UI as /clients.
 * API agency scope still comes from session (JWT + X-Agency-ID).
 */
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ClientsPage from '@/app/(dashboard)/clients/page';

export default function AgencyScopedClientsPage() {
  const params = useParams();
  const router = useRouter();
  const { status, data: session } = useSession();

  const raw = params?.agencyId;
  const paramAgency = Array.isArray(raw) ? raw[0] : raw;
  const sessionAgency =
    session?.user?.agencyId != null ? String(session.user.agencyId) : null;

  if (status === 'loading') {
    return (
      <div className="flex flex-col flex-1 bg-cream items-center justify-center p-8 min-h-[40vh]">
        <p className="text-sm font-semibold text-text-muted">Loading workspace…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.replace('/login');
    return null;
  }

  if (paramAgency && sessionAgency && paramAgency !== sessionAgency) {
    return (
      <div className="flex flex-col flex-1 bg-cream p-8 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-text-primary">Wrong workspace</h1>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          This URL is for agency <span className="font-mono">{paramAgency}</span>, but your session
          is for agency <span className="font-mono">{sessionAgency}</span>.
        </p>
        <button
          type="button"
          className="mt-5 text-left text-teal-deep font-semibold text-sm hover:underline"
          onClick={() => router.push('/clients')}
        >
          Open my clients →
        </button>
      </div>
    );
  }

  return <ClientsPage />;
}
