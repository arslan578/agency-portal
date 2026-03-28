import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Get API key from environment variable for meta tag
  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  
  // Check if this is an embedded route (has /app path or host parameter)
  const url = new URL(request.url);
  const isEmbeddedRoute = url.pathname.startsWith('/app') || url.searchParams.has('host');
  
  return { apiKey, isEmbeddedRoute };
};

export default function App() {
  const { apiKey, isEmbeddedRoute } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* Shopify App Bridge API Key meta tag - required for Shopify automated checks */}
        {apiKey && <meta name="shopify-api-key" content={apiKey} />}
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* 
          App Bridge script from CDN - required for Shopify automated checks
          Only add for embedded routes to avoid double loading on non-embedded pages
          AppProvider will check if script already exists before initializing
        */}
        {isEmbeddedRoute && apiKey && (
          <script
            src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
            data-api-key={apiKey}
            data-shopify-app-bridge="true"
          />
        )}
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
