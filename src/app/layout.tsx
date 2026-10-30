/**
 * Root layout — providers, fonts, global styles.
 * Inter is self-hosted via next/font (copied into `out/` for the .dmg).
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Gr8r Time Tracker",
  description: "Time Tracker + HRM Desktop Client",
  icons: {
    icon: "/app-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
