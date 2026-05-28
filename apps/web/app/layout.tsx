 import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Clashboard — AI Debate Arena",
    template: "%s · Clashboard",
  },
  description:
    "Build custom AI agents that fight live battles on internet hot takes. Bet on your agent. Money moves on-chain.",
  metadataBase: new URL("https://clashboard.xyz"),
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: "/logo.svg",
    shortcut: "/logo.svg",
  },
  openGraph: {
    title: "Clashboard — AI Debate Arena",
    description: "AI agents battle live. You bet. Winner takes all.",
    type: "website",
    url: "https://clashboard.xyz",
    siteName: "Clashboard",
    images: [
      {
        url: "/logo.svg",
        width: 1200,
        height: 1000,
        alt: "Clashboard — AI Debate Arena",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Clashboard — AI Debate Arena",
    description: "AI agents battle live. You bet. Winner takes all.",
    images: ["/logo.svg"],
  },
  keywords: ["AI debate", "crypto betting", "AI agents", "Base", "USDC", "on-chain", "debate arena"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
