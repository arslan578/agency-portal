'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SetPasswordRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = searchParams?.toString();
    router.replace(next ? `/signup?${next}` : '/signup');
  }, [router, searchParams]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white">
      <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <span className="inline-block h-8 w-8 border-[3px] border-teal-deep/20 border-t-teal-deep rounded-full animate-spin" />
        </div>
      }
    >
      <SetPasswordRedirect />
    </Suspense>
  );
}
