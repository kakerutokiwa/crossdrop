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
  title: "CrossDrop | インスタントP2Pファイル共有",
  description: "CrossDropは、AirDropのようにシームレスで美しい、Webベースの超高速P2Pローカルファイル共有アプリケーションです。",
  keywords: ["file share", "P2P", "WebRTC", "AirDrop clone", "local share", "CrossDrop"],
  authors: [{ name: "CrossDrop Team" }],
  manifest: "/manifest.json",
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
        {children}
      </body>
    </html>
  );
}
