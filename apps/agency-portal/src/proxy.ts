import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const PUBLIC_AUTH_PATHS = [
    "/login",
    "/verify",
    "/expired",
    "/set-password",
    "/integrations/reddit/oauth/callback",
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_AUTH_PATHS.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const pathname = req.nextUrl.pathname;

    if (isPublicPath(pathname) && !isLoggedIn) {
        return NextResponse.next();
    }

    if (isLoggedIn && pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/", req.nextUrl))
    }

    if (!isLoggedIn) {
        let callbackUrl = pathname;
        if (req.nextUrl.search) {
          callbackUrl += req.nextUrl.search;
        }
        const encodedCallbackUrl = encodeURIComponent(callbackUrl);
        return NextResponse.redirect(new URL(`/login?callbackUrl=${encodedCallbackUrl}`, req.nextUrl));
    }

    if (pathname.startsWith("/admin")) {
        const user = req.auth?.user;
        if (!user?.isSuperuser) {
            return NextResponse.redirect(new URL("/", req.nextUrl));
        }
    }

    return NextResponse.next()
})

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
