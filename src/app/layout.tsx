import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono-ibm", display: "swap" });

export const metadata: Metadata = {
  title: "explore.gta.world — Log Explorer",
  description: "GTA World staff log browser & export tool.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
