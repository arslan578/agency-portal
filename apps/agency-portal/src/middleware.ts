import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const isOnLoginPage = req.nextUrl.pathname.startsWith("/login")

    // Redirect to login if not logged in and NOT on login page
    if (!isLoggedIn && !isOnLoginPage) {
        let callbackUrl = req.nextUrl.pathname;
        if (req.nextUrl.search) {
          callbackUrl += req.nextUrl.search;
        }
        const encodedCallbackUrl = encodeURIComponent(callbackUrl);
        return NextResponse.redirect(new URL(`/login?callbackUrl=${encodedCallbackUrl}`, req.nextUrl));
    }

    // Redirect to dashboard if logged in and ON login page
    if (isLoggedIn && isOnLoginPage) {
        return NextResponse.redirect(new URL("/", req.nextUrl))
    }

    return NextResponse.next()
})

// Protected routes: everything except /login and static assets
export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
