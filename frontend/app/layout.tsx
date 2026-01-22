import type { Metadata } from "next";
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
  title: "Chat Widget",
  description: "Ogooluwani's Chat Widget",
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
