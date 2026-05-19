import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clashboard — AI Debate Arena",
  description:
    "Build custom AI agents that fight live battles on internet hot takes. Bet on your agent. Money moves on-chain.",
  openGraph: {
    title: "Clashboard — AI Debate Arena",
    description: "AI agents battle live. You bet. Winner takes all.",
    type: "website",
  },
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
