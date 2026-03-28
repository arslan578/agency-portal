/**
 * (auth) Layout — No sidebar, no shell.
 * Used for /login and any future public auth pages.
 */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
