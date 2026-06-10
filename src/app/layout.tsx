import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://crossdrop.netlify.app"),
  title: "CrossDrop | インスタントP2Pファイル共有",
  description: "CrossDropは、AirDropのようにシームレスで美しい、Webベースの超高速P2Pローカルファイル共有アプリケーションです。",
  keywords: ["file share", "P2P", "WebRTC", "AirDrop clone", "local share", "CrossDrop", "ファイル共有", "P2Pファイル転送"],
  authors: [{ name: "CrossDrop Team" }],
  manifest: "/manifest.json",
  openGraph: {
    title: "CrossDrop | インスタントP2Pファイル共有",
    description: "CrossDropは、AirDropのようにシームレスで美しい、Webベースの超高速P2Pローカルファイル共有アプリケーションです。",
    url: "https://crossdrop.netlify.app",
    siteName: "CrossDrop",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CrossDrop | インスタントP2Pファイル共有",
    description: "CrossDropは、AirDropのようにシームレスで美しい、Webベースの超高速P2Pローカルファイル共有アプリケーションです。",
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${outfit.variable} ${inter.variable} h-full antialiased no-scrollbar`}
      style={{ fontFamily: "var(--font-outfit), var(--font-inter), sans-serif" }}
    >
      <body className="h-full min-h-full flex flex-col no-scrollbar">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "CrossDrop",
              "operatingSystem": "Windows, macOS, Linux, Android, iOS",
              "applicationCategory": "UtilityApplication",
              "description": "CrossDropは、AirDropのようにシームレスで美しい、Webベースの超高速P2Pローカルファイル共有アプリケーションです。",
              "url": "https://crossdrop.netlify.app",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
              },
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
