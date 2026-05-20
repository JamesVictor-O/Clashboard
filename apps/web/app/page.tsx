import { Nav } from "@/components/landing/Nav";
import { HeroSection } from "@/components/landing/HeroSection";
import { StatsStrip } from "@/components/landing/StatsStrip";
import { CharacterShowcase } from "@/components/landing/CharacterShowcase";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingCTA } from "@/components/landing/LandingCTA";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-clash-black text-clash-white overflow-x-hidden">
      <Nav />
      <HeroSection />
      <StatsStrip />
      <CharacterShowcase />
      <HowItWorks />

      {/* Footer */}
      <footer className="border-t border-white/6 px-4 sm:px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-0.5">
            <span className="font-display text-sm font-extrabold tracking-[0.15em] text-clash-gold">CLASH</span>
            <span className="font-display text-sm font-extrabold tracking-[0.15em] text-clash-white/50">BOARD</span>
          </div>
          <p className="font-body text-xs text-white/20 order-last sm:order-none">
            Built on Celo · Powered by Venice AI · 2025
          </p>
          <div className="flex items-center gap-5 sm:gap-6">
            {[
              { href: "/lobby", label: "Arena" },
              { href: "/build", label: "Builder" },
              { href: "/lobby", label: "Hot Takes" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="font-body text-xs text-white/25 hover:text-white/50 uppercase tracking-widest transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
