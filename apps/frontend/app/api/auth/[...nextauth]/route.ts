/**
 * Next Auth API Route - DEVELOPMENT MODE
 * Authentication temporarily disabled for deployment testing.
 */

export const runtime = "edge";

export function GET() {
    return Response.json({
        auth: "disabled",
        message: "Authentication is temporarily disabled for deployment testing"
    });
}

export function POST() {
    return Response.json({
        auth: "disabled",
        message: "Authentication is temporarily disabled for deployment testing"
    });
}
