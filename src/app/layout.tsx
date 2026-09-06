/**
 * Root layout — providers, fonts, global styles.
 */
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/providers";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} min-h-screen font-sans antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
