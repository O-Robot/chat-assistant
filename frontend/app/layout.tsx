import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SocketInitializer } from "@/components/initializeSocket";

const space = Space_Grotesk({
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Chat",
  description: "Ogooluwani's Chat Widget",
  applicationName: "Portfolio Chat Admin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chat Admin",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${space.className} antialiased`}
        suppressHydrationWarning
      >
        <SocketInitializer />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
