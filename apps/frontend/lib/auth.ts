/**
 * Auth.js Configuration - DEVELOPMENT MODE
 * Authentication temporarily disabled for deployment testing.
 */

import GoogleProvider from "next-auth/providers/google"
import { getMockSession } from "./mockUser"

export const runtime = "edge"

export const authConfig = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "disabled",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "disabled",
        }),
    ],
    secret: process.env.AUTH_SECRET || "dev-mode-secret",
    trustHost: true,
    // Development mode: bypass all auth
    callbacks: {
        async session() {
            return getMockSession()
        },
        async jwt() {
            return { sub: "dev-user" }
        },
    },
}
