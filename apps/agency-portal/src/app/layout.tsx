import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";
import { AgencyAuthProvider } from "@/components/providers/AgencyAuthProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Kaivo Agency Portal",
  description: "Advanced Agency Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@300..700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
        <Script id="bis-scrub" strategy="afterInteractive">
          {`(function(){function scrub(){try{document.querySelectorAll('[bis_skin_checked]').forEach(function(el){el.removeAttribute('bis_skin_checked');});}catch(e){}} scrub(); var mo=new MutationObserver(scrub); mo.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['bis_skin_checked']});})();`}
        </Script>
      </head>
      <body
        className="min-h-screen bg-cream text-foreground antialiased"
        suppressHydrationWarning
      >
        <AgencyAuthProvider>
          {children}
          <Toaster position="top-right" richColors />
        </AgencyAuthProvider>
      </body>
    </html>
  );
}
