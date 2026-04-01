'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import { useUnassignedCount } from "@/hooks/useAgencyApi";

const NAV_ITEMS = [
  {
    name: "Dashboard",
    href: "/",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <rect x="1" y="1" width="6" height="6" rx="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    name: "AI Insights",
    href: "/insights",
    pip: "7",
    pipColor: "bg-coral",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5v4l2.5 1.5" />
      </svg>
    ),
  },
  {
    name: "Clients",
    href: "/clients",
    pip: "12",
    pipColor: "bg-aqua",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <path d="M2 12V5l6-3 6 3v7l-6 3-6-3z" />
      </svg>
    ),
  },
  {
    name: "Client Manager",
    href: "/client-manager",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <path d="M2 10l4-4 3 3 5-5" />
      </svg>
    ),
  },
  {
    name: "Integrations",
    href: "/integrations",
    dotColor: "#4DB6AC",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <path d="M13 3H3a1 1 0 00-1 1v1.5l5 4.5v4l2 1v-5l5-4.5V4a1 1 0 00-1-1z" />
      </svg>
    ),
  },
  {
    name: "Billing",
    href: "/billing",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <rect x="1" y="3" width="14" height="10" rx="2" />
        <path d="M1 7h14" />
      </svg>
    ),
  },
  {
    name: "Settings",
    href: "/settings",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
];

type SidebarUserSnapshot = {
  name?: string | null;
  email?: string | null;
  agencyName?: string | null;
  tier?: string | null;
};

export function AgencySidebar({ initialUser }: { initialUser?: SidebarUserSnapshot }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { count: unassignedCount } = useUnassignedCount();
  const user = {
    name: session?.user?.name ?? initialUser?.name ?? null,
    email: session?.user?.email ?? initialUser?.email ?? null,
    agencyName: session?.user?.agencyName ?? initialUser?.agencyName ?? null,
    tier: session?.user?.tier ?? initialUser?.tier ?? null,
  };

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() || "K";

  return (
    <aside
      className="w-[232px] bg-white border-r-2 border-cream-border flex flex-col shrink-0 fixed left-0 top-0 h-screen z-50 overflow-y-auto scrollbar-hide"
      suppressHydrationWarning
    >
      {/* Logo */}
      <div className="px-[18px] py-[14px] border-b-2 border-cream-border flex items-center gap-2.5">
        <svg width="32" height="32" viewBox="0 0 239 239" fill="none">
          <path d="M0 0 C3.94 1.39 6.92 3.24 10.25 5.75 C15.07 9.33 19.97 12.72 25 16 C24.44 19.36 23.77 21.43 22.125 24.5 C16.04 36.27 15.75 49.01 18.88 61.61 C21.45 69.39 25.52 76.88 31 83 C33 83 33 83 33 83 C33.2 82.03 33.39 81.06 33.59 80.06 C38.31 58.32 49.75 39.70 68.17 26.78 C83.56 16.94 97.70 13 116 13 C116 22.9 116 32.8 116 43 C111.71 43.66 107.42 44.32 103 45 C89.47 49.06 77.89 55.95 70.95 68.62 C67.5 74.55 66 81 66 81 C91.37 69.11 114.39 67.88 137.75 76.31 C149.87 80.84 160.14 87.77 168 97 C167.9 101.29 164.56 104.13 152.3 115.08 C146 119 146 119 146 119 C132.83 106.29 103.57 101.74 82 107 C82 109 85.69 110 85.69 110 C119.12 132.15 139.69 184.46 135 201 C121.24 199.38 105 196 105 196 C105.47 176.12 75 139 75 139 C83.15 163.15 42 237 38 238 C24 214 29.63 207.44 48.38 174.13 C48 153 38 166 38 166 C4.4 192.5 -50 192 -50 192 C-43 164 7 153 7 153 C21 136 -39.3 122.34 -71 76 C-48.75 69.64 -42 69 -42 69 C-32.88 88.04 -7 104 10 106 C-7.84 85.69 -14.15 40.12 0 0 Z" fill="#FC756C" transform="translate(71,0)" />
        </svg>
        <svg height="22" viewBox="0 0 463 90" fill="none" className="mt-0.5">
          <path d="M0 0 C16.08 0 26.19 2.31 35.19 11.09 C44.87 22.58 45.17 39.12 43.99 53.4 C43.23 60.85 42.14 67.76 38.44 74.38 C32.62 83.63 25.42 87.47 17.35 89.52 C5.95 90.7 -15.63 90.74 -35.31 79.85 C-45.49 69.44 -44.85 53.26 -44.71 39.75 C-44.48 28.73 -42.47 19.18 -35.19 10.56 C-22.16 -0.12 -10.95 -0.1 0 0 Z M-25.56 24.38 C-30.49 34.73 -30.3 50.38 -27.31 61.31 C-25.43 66.28 -23.21 69.41 -18.56 72.13 C-6.86 74.59 10.31 74.73 22.25 69.19 C29.64 59.68 29.12 46.27 27.75 34.81 C26.59 28.03 25.09 23.77 19.88 19.06 C6.45 12.47 -15.15 12.53 -25.56 24.38 Z" fill="#2a9d8f" transform="translate(418.56,-0.38)" />
          <path d="M0 0 C10.56 0 16 0 16 0 C17 41 17 41 17 41 C26 31 31.32 25.71 38.25 17.97 C47.81 5.4 55 0 76 0 C68.13 9.19 57.75 20.22 50.84 27.95 C45.43 33.55 40 41 40 41 C52.16 54.25 70 73.21 82 88 C65.67 90.07 59.79 86.75 48 74 C39.56 64.36 28 53 28 53 C22.53 56.61 16.38 66.88 16 88 C10.72 88 0 88 0 88 Z" fill="#2a9d8f" transform="translate(1,1)" />
          <path d="M0 0 C11.88 0 18 0 18 0 C34 44 43 65 43 65 C53 38 69 0 86 0 C78.94 20.68 53 88 53 88 C40.46 88 34 88 34 88 C19.8 52.77 0 0 0 0 Z" fill="#2a9d8f" transform="translate(268,1)" />
          <path d="M0 0 C10.56 0 16 0 16 0 C16 88 16 88 16 88 C5.44 88 0 88 0 88 Z" fill="#449C8B" transform="translate(224,1)" />
          <path d="M0 0 C14.9 0.09 17.14 0.11 17.14 0.11 C50.14 88.11 50.14 88.11 50.14 88.11 C38.92 88.11 33.14 88.11 33.14 88.11 C27.14 71.11 27.14 71.11 27.14 71.11 C14.27 71.44 -11.86 72.11 -11.86 72.11 C-35.86 88.11 -35.86 88.11 -35.86 88.11 C-5.86 55.11 20.14 55.11 20.14 55.11 C8.14 22.11 7.14 22.11 7.14 22.11 Z" fill="#2a9d8f" transform="translate(144.86,0.89)" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className="px-2.5 pt-3 flex-1 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/clients"
                ? pathname.startsWith("/clients") ||
                  Boolean(pathname?.match(/^\/agency\/\d+\/clients(\/|$)/))
                : pathname.startsWith(item.href);

          let displayPip = <>{item.pip}</>;
          let pipColor = item.pipColor;

          if (item.name === "Client Manager" && unassignedCount > 0) {
            displayPip = <>{unassignedCount}</>;
            pipColor = "bg-coral";
          }

          const hasPip = (item.name === "Client Manager" && unassignedCount > 0) || item.pip;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-[9px] px-2.5 py-[9px] rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-v-teal text-white shadow-md"
                  : "text-v-text-secondary hover:bg-cream hover:text-v-text-primary"
              }`}
            >
              {item.icon}
              <span className="flex-1">{item.name}</span>
              {hasPip && (
                <span className={`ml-auto min-w-[18px] h-[18px] px-1.5 ${pipColor?.replace("bg-", "bg-v-") || "bg-v-teal"} rounded-md text-[10px] font-bold text-white flex items-center justify-center`}>
                  {displayPip}
                </span>
              )}
              {item.dotColor && (
                <span className="ml-auto w-2 h-2 rounded-full shrink-0" style={{ background: item.dotColor }} />
              )}
            </Link>
          );
        })}

        {session?.user?.isSuperuser && (
          <>
            <div className="h-px bg-cream-border my-3" />
            <Link
              href="/admin/invite"
              className={`flex items-center gap-[9px] px-2.5 py-[9px] rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
                pathname.startsWith("/admin")
                  ? "bg-coral text-white shadow-md"
                  : "text-coral hover:bg-coral-light hover:text-coral-dark"
              }`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[16px] h-[16px] shrink-0">
                <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
                <circle cx="8" cy="8" r="3" />
              </svg>
              <span className="flex-1">Admin</span>
            </Link>
          </>
        )}
      </nav>

      {/* User Card Footer */}
      <div className="mt-auto p-2.5 border-t-2 border-cream-border">
        <div
          className="bg-cream rounded-xl px-3 py-2.5 flex items-center gap-2.5 cursor-pointer border border-cream-border hover:bg-cream-dark transition-colors"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign Out"
        >
          <div className="w-[34px] h-[34px] rounded-lg bg-coral flex items-center justify-center text-[12px] font-extrabold text-white shrink-0 shadow-sm">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-v-text-primary truncate">
              {user?.agencyName || user?.name || "Agency"}
            </div>
            <div className="text-[11px] text-v-text-muted truncate font-medium">
              {user?.tier || "Agency Plan"}
            </div>
          </div>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-v-text-muted ml-auto shrink-0 opacity-40">
            <path d="M6 12l-4-4 4-4M2 8h10M14 2v12" />
          </svg>
        </div>
      </div>
    </aside>
  );
}
