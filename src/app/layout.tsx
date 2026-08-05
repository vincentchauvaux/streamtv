import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CookieBanner } from "@/components/cookie-banner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "StreamTV — Votre IPTV, partout",
  description:
    "Lecteur IPTV moderne avec playlists M3U, guide TV et synchronisation",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
