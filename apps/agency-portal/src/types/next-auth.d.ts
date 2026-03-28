import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      accessToken: string;
      agencyId: string | null;
      agencyRole: string | null;
      agencyName: string | null;
      tier: string;
    };
    accessToken?: string;
    refreshError?: string;
  }

  interface User {
    // Keep DefaultUser fields compatible with NextAuth
    // and extend with our backend-auth token + agency context.
    id: DefaultUser["id"];
    name?: DefaultUser["name"];
    email?: DefaultUser["email"];
    image?: DefaultUser["image"];
    accessToken: string;
    accessTokenExpiresAt?: number | null;
    agencyId: string | null;
    agencyRole: string | null;
    agencyName: string | null;
    tier: string;
  }
}
