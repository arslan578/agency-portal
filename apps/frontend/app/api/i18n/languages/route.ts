
export const runtime = "edge";

export function GET() {
    return Response.json([
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'es', name: 'Español' }
    ]);
}
