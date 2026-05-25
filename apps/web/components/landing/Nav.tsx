"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useScroll } from "framer-motion";
import { ConnectWallet } from "@/components/shared/ConnectWallet";

const NAV_LINKS = [
  { href: "/arena", label: "Arena" },
  { href: "/lobby", label: "Hot Takes" },
  { href: "/forge", label: "Forge Agent" },
  { href: "#how-it-works", label: "How It Works" },
];

export function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = scrollY.on("change", (v) => setScrolled(v > 40));
    return unsub;
  }, [scrollY]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 transition-all duration-300"
        animate={{
          backgroundColor:
            scrolled || menuOpen ? "rgba(10,10,15,0.95)" : "transparent",
          borderBottomColor:
            scrolled && !menuOpen ? "rgba(255,255,255,0.07)" : "transparent",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          backdropFilter: scrolled || menuOpen ? "blur(20px)" : "blur(0px)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            onClick={() => setMenuOpen(false)}
          >
            <img src="/logo.svg" alt="Clashboard" className="h-6 w-auto flex-shrink-0" />
            <span className="font-display text-lg font-extrabold tracking-[0.15em] text-clash-gold">
              CLASH
            </span>
            <span className="font-display text-lg font-extrabold tracking-[0.15em] text-clash-white">
              BOARD
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-body text-xs text-white/40 hover:text-clash-white uppercase tracking-[0.2em] transition-colors duration-150"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <ConnectWallet />
            </div>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden relative w-9 h-9 flex flex-col items-center justify-center gap-1.5"
              aria-label="Toggle menu"
            >
              <motion.span
                className="block h-[1.5px] bg-clash-white origin-center"
                animate={{
                  rotate: menuOpen ? 45 : 0,
                  y: menuOpen ? 5 : 0,
                  width: menuOpen ? 22 : 22,
                }}
                transition={{ duration: 0.22 }}
              />
              <motion.span
                className="block h-[1.5px] bg-clash-white"
                animate={{ opacity: menuOpen ? 0 : 1, width: 16 }}
                transition={{ duration: 0.15 }}
              />
              <motion.span
                className="block h-[1.5px] bg-clash-white origin-center"
                animate={{
                  rotate: menuOpen ? -45 : 0,
                  y: menuOpen ? -5 : 0,
                  width: menuOpen ? 22 : 22,
                }}
                transition={{ duration: 0.22 }}
              />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile fullscreen menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-clash-black/98 flex flex-col pt-24 pb-12 px-8 md:hidden"
          >
            {/* Links */}
            <nav className="flex flex-col gap-1 flex-1">
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.07 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-5 border-b border-white/6 font-display text-2xl font-bold text-clash-white hover:text-clash-gold transition-colors uppercase tracking-wide"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            {/* Connect wallet at bottom of menu */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="pt-8"
            >
              <ConnectWallet />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
