import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BrewBharat Console",
  description: "AI-native CRM for BrewBharat — India's specialty coffee brand",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Fonts — loaded in globals.css via @import */}
      </head>
      <body className="bg-espresso text-parchment antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
