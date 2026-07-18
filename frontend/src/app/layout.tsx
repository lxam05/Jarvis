import type { Metadata } from "next";
import { Orbitron, Share_Tech_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const hudSans = Orbitron({
  variable: "--font-hud-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const hudMono = Share_Tech_Mono({
  variable: "--font-hud-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "JARVIS",
  description: "Personal AI operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${hudSans.variable} ${hudMono.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-[#02060c] text-[#e0f7ff]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
