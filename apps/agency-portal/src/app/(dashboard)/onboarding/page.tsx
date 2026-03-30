'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useApiAuth } from '@/hooks/useAgencyApi';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { toast } from 'sonner';

type Step = 1 | 2 | 3 | 4;

const PLATFORMS = [
  { id: 'meta', name: 'Meta Ads', icon: 'f', bg: '#e8effe', color: '#1877f2' },
  { id: 'google', name: 'Google Ads', icon: 'G', bg: '#fdecea', color: '#ea4335' },
  { id: 'tiktok', name: 'TikTok Ads', icon: 'T', bg: '#e6f9fb', color: '#00b8c4' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', bg: '#e8f0f8', color: '#0077b5' },
  { id: 'snapchat', name: 'Snapchat', icon: 'S', bg: '#fffbe6', color: '#FFCC00' },
  { id: 'pinterest', name: 'Pinterest', icon: 'P', bg: '#fdecea', color: '#e60023' },
];

const MOCK_AD_ACCOUNTS = [
  { id: 'act_1', name: 'Main Business Account', platform: 'meta', spend: '$12.4k/mo' },
  { id: 'act_2', name: 'E-commerce Store', platform: 'meta', spend: '$8.2k/mo' },
  { id: 'act_3', name: 'Brand Awareness', platform: 'google', spend: '$5.1k/mo' },
  { id: 'act_4', name: 'Shopping Campaigns', platform: 'google', spend: '$9.7k/mo' },
  { id: 'act_5', name: 'Performance Max', platform: 'google', spend: '$3.4k/mo' },
  { id: 'act_6', name: 'Creator Account', platform: 'tiktok', spend: '$6.8k/mo' },
];

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

export default function OnboardingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { accessToken, agencyId } = useApiAuth();

  const [step, setStep] = useState<Step>(1);

  const [agencyName, setAgencyName] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('USD');

  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [dataWindow, setDataWindow] = useState<'30d' | '90d' | '6mo' | '1yr'>('90d');

  const [syncProgress, setSyncProgress] = useState<Record<string, number>>({});
  const [syncComplete, setSyncComplete] = useState(false);

  useEffect(() => {
    if (session?.user?.name) setAgencyName(session.user.agencyName || session.user.name || '');
    if (session?.user?.email) setAgencyEmail(session.user.email || '');
  }, [session]);

  async function handleSaveProfile() {
    if (!agencyName.trim()) {
      toast.error('Please enter your agency name.');
      return;
    }
    if (accessToken && agencyId) {
      try {
        await apiClient.patch(
          API_ENDPOINTS.AGENCY.UPDATE(agencyId),
          { name: agencyName },
          { accessToken, agencyId },
        );
      } catch {
        // non-blocking
      }
    }
    setStep(2);
  }

  function handleConnectPlatform(platformId: string) {
    setConnectingPlatform(platformId);
    setTimeout(() => {
      setConnectedPlatforms(prev => new Set(prev).add(platformId));
      setConnectingPlatform(null);
      toast.success(`Connected to ${PLATFORMS.find(p => p.id === platformId)?.name}`);
    }, 1500);
  }

  function handleDisconnect(platformId: string) {
    setConnectedPlatforms(prev => {
      const next = new Set(prev);
      next.delete(platformId);
      return next;
    });
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      MOCK_AD_ACCOUNTS.filter(a => a.platform === platformId).forEach(a => next.delete(a.id));
      return next;
    });
  }

  function toggleAccount(accountId: string) {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function handleSelectAll() {
    const available = MOCK_AD_ACCOUNTS.filter(a => connectedPlatforms.has(a.platform));
    if (selectedAccounts.size === available.length) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(available.map(a => a.id)));
    }
  }

  function startSync() {
    setStep(4);
    const accountIds = Array.from(selectedAccounts);
    const progress: Record<string, number> = {};
    accountIds.forEach(id => { progress[id] = 0; });
    setSyncProgress({ ...progress });

    accountIds.forEach((id, idx) => {
      const duration = 2000 + idx * 600 + Math.random() * 1000;
      const steps = 20;
      const interval = duration / steps;
      let current = 0;

      const timer = setInterval(() => {
        current++;
        setSyncProgress(prev => ({ ...prev, [id]: Math.min(100, Math.round((current / steps) * 100)) }));
        if (current >= steps) {
          clearInterval(timer);
          setSyncProgress(prev => {
            const updated = { ...prev, [id]: 100 };
            if (Object.values(updated).every(v => v >= 100)) {
              setTimeout(() => setSyncComplete(true), 500);
            }
            return updated;
          });
        }
      }, interval);
    });
  }

  function handleFinish() {
    router.push('/');
  }

  const availableAccounts = MOCK_AD_ACCOUNTS.filter(a => connectedPlatforms.has(a.platform));

  const stepLabels = ['Agency Profile', 'Connect Platforms', 'Select Clients', 'Sync & Go'];

  return (
    <div className="min-h-screen bg-surface-secondary flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-border-subtle px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="26" height="26" viewBox="0 0 239 239" fill="none">
            <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.125 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.70 68.17 26.78 C83.56 16.94 97.70 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FF7043" transform="translate(71,0)" />
          </svg>
          <span className="text-[16px] font-bold text-text-primary">Kaivo Setup</span>
        </div>
        <button onClick={() => router.push('/')} className="text-[12px] font-semibold text-text-muted hover:text-text-primary">
          Skip for now →
        </button>
      </div>

      {/* Step Indicator */}
      <div className="bg-white border-b border-border-subtle px-8 py-3">
        <div className="max-w-[700px] mx-auto flex items-center gap-1">
          {stepLabels.map((label, i) => {
            const s = (i + 1) as Step;
            const isActive = step === s;
            const isDone = step > s;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  isDone ? 'bg-teal-deep text-white' : isActive ? 'bg-teal-deep text-white' : 'bg-surface-secondary text-text-muted'
                }`}>
                  {isDone ? '✓' : s}
                </div>
                <span className={`text-[12px] font-semibold whitespace-nowrap ${isActive ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
                {i < 3 && <div className={`flex-1 h-[2px] mx-2 rounded-full ${step > s ? 'bg-teal-deep' : 'bg-surface-secondary'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center pt-10 pb-20 px-6">
        <div className="w-full max-w-[640px]">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Set up your agency</h2>
                <p className="text-[14px] text-text-muted mt-1">Tell us about your agency to personalize your experience.</p>
              </div>

              <div className="bg-white rounded-xl border border-border p-6 space-y-5">
                <div className="flex items-center gap-5">
                  <div className="w-[64px] h-[64px] rounded-full bg-surface-secondary border border-border flex items-center justify-center text-text-muted text-[20px] shrink-0 cursor-pointer hover:bg-surface-hover transition-colors">
                    📷
                  </div>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-semibold text-text-primary mb-[6px]">Agency Logo</div>
                    <div className="text-[11.5px] text-text-muted">Click to upload (PNG, JPG, max 2MB)</div>
                  </div>
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Agency Name *</label>
                  <input
                    type="text"
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    placeholder="Your Agency Name"
                    className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep/20"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Contact Email</label>
                  <input
                    type="email"
                    value={agencyEmail}
                    onChange={e => setAgencyEmail(e.target.value)}
                    placeholder="hello@agency.com"
                    className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Timezone</label>
                    <select
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
                      className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary focus:outline-none focus:border-teal-deep"
                    >
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Currency</label>
                    <select
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                      className="w-full h-[44px] px-3 border border-border rounded-[10px] bg-surface-secondary text-[13.5px] text-text-primary focus:outline-none focus:border-teal-deep"
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveProfile}
                  className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Connect your platforms</h2>
                <p className="text-[14px] text-text-muted mt-1">Link your ad accounts to start importing data.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {PLATFORMS.map(p => {
                  const isConnected = connectedPlatforms.has(p.id);
                  const isConnecting = connectingPlatform === p.id;
                  return (
                    <div key={p.id} className={`bg-white rounded-xl border p-5 transition-colors ${isConnected ? 'border-teal' : 'border-border'}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-[40px] h-[40px] rounded-lg flex items-center justify-center text-[15px] font-semibold shrink-0"
                          style={{ background: p.bg, color: p.color }}
                        >
                          {p.icon}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-text-primary">{p.name}</div>
                          {isConnected && (
                            <span className="text-[10.5px] font-semibold text-green">● Connected</span>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <button
                          onClick={() => handleDisconnect(p.id)}
                          className="w-full h-[36px] border border-border rounded-lg text-[12px] font-semibold text-text-muted hover:border-coral hover:text-coral transition-colors"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnectPlatform(p.id)}
                          disabled={isConnecting}
                          className="w-full h-[36px] bg-teal-deep text-white rounded-lg text-[12px] font-semibold hover:bg-teal-deep/90 transition-colors disabled:opacity-60"
                        >
                          {isConnecting ? (
                            <span className="inline-block h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            'Connect'
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="text-[13px] font-semibold text-text-muted hover:text-text-primary">
                  ← Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={connectedPlatforms.size === 0}
                  className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors disabled:opacity-50"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-bold text-text-primary">Select ad accounts</h2>
                <p className="text-[14px] text-text-muted mt-1">Choose which accounts to import. You can always add more later.</p>
              </div>

              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-text-primary">
                    {availableAccounts.length} accounts found
                  </span>
                  <button
                    onClick={handleSelectAll}
                    className="text-[12px] font-semibold text-teal-deep hover:underline"
                  >
                    {selectedAccounts.size === availableAccounts.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                {availableAccounts.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-[13px]">
                    Connect a platform first to see ad accounts.
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {availableAccounts.map(acc => {
                      const isSelected = selectedAccounts.has(acc.id);
                      const plat = PLATFORMS.find(p => p.id === acc.platform);
                      return (
                        <label key={acc.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-secondary/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAccount(acc.id)}
                            className="w-4 h-4 rounded border-border text-teal-deep focus:ring-teal-deep accent-teal-deep"
                          />
                          <div
                            className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0"
                            style={{ background: plat?.bg, color: plat?.color }}
                          >
                            {plat?.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-semibold text-text-primary truncate">{acc.name}</div>
                            <div className="text-[11px] text-text-muted">{plat?.name}</div>
                          </div>
                          <span className="text-[11.5px] font-semibold text-text-muted font-mono">{acc.spend}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-text-primary mb-[6px]">Historical Data Window</label>
                <div className="flex gap-2">
                  {(['30d', '90d', '6mo', '1yr'] as const).map(w => (
                    <button
                      key={w}
                      onClick={() => setDataWindow(w)}
                      className={`px-4 h-[36px] rounded-lg text-[12px] font-semibold transition-colors ${
                        dataWindow === w ? 'bg-teal-deep text-white' : 'bg-surface-secondary text-text-muted border border-border hover:bg-surface-hover'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="text-[13px] font-semibold text-text-muted hover:text-text-primary">
                  ← Back
                </button>
                <button
                  onClick={startSync}
                  disabled={selectedAccounts.size === 0}
                  className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[13.5px] h-[44px] px-8 rounded-[10px] transition-colors disabled:opacity-50"
                >
                  Start Sync →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {!syncComplete ? (
                <>
                  <div>
                    <h2 className="text-[24px] font-bold text-text-primary">Syncing your data...</h2>
                    <p className="text-[14px] text-text-muted mt-1">Importing historical performance data. This usually takes about a minute.</p>
                  </div>

                  <div className="bg-white rounded-xl border border-border p-5 space-y-4">
                    {Array.from(selectedAccounts).map(accId => {
                      const acc = MOCK_AD_ACCOUNTS.find(a => a.id === accId);
                      const prog = syncProgress[accId] || 0;
                      const plat = PLATFORMS.find(p => p.id === acc?.platform);
                      return (
                        <div key={accId} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[9px] font-semibold"
                                style={{ background: plat?.bg, color: plat?.color }}
                              >
                                {plat?.icon}
                              </div>
                              <span className="text-[12.5px] font-semibold text-text-primary">{acc?.name}</span>
                            </div>
                            <span className="text-[11px] font-semibold text-text-muted font-mono">{prog}%</span>
                          </div>
                          <div className="w-full h-[6px] bg-surface-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-deep transition-all duration-300"
                              style={{ width: `${prog}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 space-y-6">
                  <div className="w-[72px] h-[72px] rounded-full bg-teal-light flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-teal-deep" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[28px] font-bold text-text-primary">You&apos;re all set!</h2>
                    <p className="text-[14px] text-text-muted mt-2 max-w-[400px] mx-auto">
                      We&apos;ve synced {selectedAccounts.size} ad account{selectedAccounts.size !== 1 ? 's' : ''} across {connectedPlatforms.size} platform{connectedPlatforms.size !== 1 ? 's' : ''}.
                      Your dashboard is ready.
                    </p>
                  </div>
                  <div className="flex gap-6 justify-center text-center">
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{connectedPlatforms.size}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">Platforms</div>
                    </div>
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{selectedAccounts.size}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">Accounts</div>
                    </div>
                    <div className="bg-white rounded-xl border border-border px-6 py-4">
                      <div className="text-[24px] font-bold text-teal-deep font-mono">{dataWindow}</div>
                      <div className="text-[11px] font-semibold text-text-muted mt-1">History</div>
                    </div>
                  </div>
                  <button
                    onClick={handleFinish}
                    className="bg-teal-deep hover:bg-teal-deep/90 text-white font-bold text-[14px] h-[48px] px-10 rounded-[10px] transition-colors"
                  >
                    Go to Dashboard →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
