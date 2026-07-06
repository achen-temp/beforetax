import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { HashSessionRedirect } from "@/components/auth/hash-session-redirect";
import { PLATFORM_NAME, PLATFORM_TAGLINE } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: PLATFORM_NAME,
  description: PLATFORM_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <HashSessionRedirect />
        {children}
      </body>
    </html>
  );
}
