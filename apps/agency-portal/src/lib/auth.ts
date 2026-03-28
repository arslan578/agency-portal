import NextAuth from "next-auth";
import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import axios from "axios";
import { logger } from "@/lib/logger";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://kaivo-backend.onrender.com";
const AUTH_BASE_URL = `${API_BASE}/auth`;

function decodeJwtExp(accessToken?: string): number | null {
  if (!accessToken) return null;
  try {
    const [, payloadB64] = accessToken.split(".");
    if (!payloadB64) return null;
    const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(accessToken: string) {
  const res = await axios.post(
    `${AUTH_BASE_URL}/refresh`,
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.data as { access_token: string; token_type: string };
}

type RefreshErrorCode = "TOKEN_REFRESH_FAILED";

interface AgencyJWT extends JWT {
  user?: User;
  accessToken?: string;
  accessTokenExpiresAt?: number | null;
  refreshError?: RefreshErrorCode;
}

async function fetchBackendProfile(accessToken: string) {
  const userResponse = await axios.get(`${AUTH_BASE_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    id: userResponse.data.id,
    email: userResponse.data.email,
    name: userResponse.data.full_name,
    image: userResponse.data.avatar_url,
    accessToken,
    accessTokenExpiresAt: decodeJwtExp(accessToken),
    agencyId: userResponse.data.agency_id,
    agencyRole: userResponse.data.agency_role,
    agencyName: userResponse.data.agency_name,
    tier: userResponse.data.tier,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: "Kaivo Agency Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          logger.authInfo("Credentials authorize attempt", {
            email: credentials.email,
          });
          const response = await axios.post(`${AUTH_BASE_URL}/login`, {
            email: credentials.email,
            password: credentials.password,
          });

          if (response.data && response.data.access_token) {
            return await fetchBackendProfile(response.data.access_token);
          }
          return null;
        } catch (error) {
          logger.authError("Credentials authorize failed", {
            email: credentials?.email,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      const t = token as AgencyJWT;

      // Google OAuth sign-in: exchange Google id_token with backend
      if (account?.provider === "google" && account.id_token) {
        try {
          logger.authInfo("Google sign-in: exchanging id_token with backend");
          const response = await axios.post(`${AUTH_BASE_URL}/google`, {
            id_token: account.id_token,
          });

          if (response.data?.access_token) {
            const profile = await fetchBackendProfile(response.data.access_token);
            t.user = profile as unknown as User;
            t.accessToken = profile.accessToken;
            t.accessTokenExpiresAt = profile.accessTokenExpiresAt;
            t.refreshError = undefined;
            logger.authInfo("Google sign-in: backend token obtained", {
              email: profile.email,
            });
          }
        } catch (err) {
          logger.authError("Google sign-in: backend exchange failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return t;
      }

      // Credentials sign-in: user object already has backend token
      if (user) {
        const u = user as User;
        t.user = u;
        t.accessToken = u.accessToken as string | undefined;
        t.accessTokenExpiresAt = u.accessTokenExpiresAt ?? decodeJwtExp(t.accessToken);
        t.refreshError = undefined;
        return t;
      }

      // Subsequent requests: refresh token if near expiry
      const expiresAt = t.accessTokenExpiresAt ?? undefined;
      const accessToken = t.accessToken ?? undefined;
      if (!accessToken || !expiresAt) return t;

      const shouldRefresh = Date.now() > expiresAt - 2 * 60 * 1000;
      if (!shouldRefresh) return t;

      try {
        logger.authInfo("Refreshing access token", { expiresAt });
        const refreshed = await refreshAccessToken(accessToken);
        t.accessToken = refreshed.access_token;
        t.accessTokenExpiresAt = decodeJwtExp(refreshed.access_token);
        t.refreshError = undefined;
        if (t.user) {
          (t.user as User).accessToken = refreshed.access_token;
        }
        logger.authInfo("Access token refreshed", {
          newExpiresAt: t.accessTokenExpiresAt,
        });
      } catch (err) {
        t.refreshError = "TOKEN_REFRESH_FAILED";
        logger.authError("Access token refresh failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return t;
    },
    async session({ session, token }) {
      const t = token as AgencyJWT;
      const s = session as Session;
      if (t.user) {
        s.user = t.user as Session["user"];
      }
      s.accessToken = t.accessToken;
      s.refreshError = t.refreshError;
      return s;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.AUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
});
