import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "clash-black": "#0A0A0F",
        "clash-white": "#F5F5F0",
        "clash-gold": "#FFB800",
        "clash-blue": "#1A3FBE",
        "clash-red": "#BE1A1A",
        "clash-dim": "#1A1A28",
      },
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
        sans: ["DM Sans", "sans-serif"],
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 8px 2px rgba(255, 184, 0, 0.4)",
          },
          "50%": {
            boxShadow: "0 0 24px 8px rgba(255, 184, 0, 0.8)",
          },
        },
        "wipe-out": {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(100%)" },
        },
        "crowd-pop": {
          "0%": { transform: "scale(0) translateY(0)", opacity: "1" },
          "60%": { transform: "scale(1.4) translateY(-20px)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(-40px)", opacity: "0" },
        },
        "score-fill": {
          "0%": { width: "0%" },
          "100%": { width: "var(--score-width)" },
        },
        "payout-flash": {
          "0%": { opacity: "0" },
          "20%": { opacity: "0.6" },
          "80%": { opacity: "0.6" },
          "100%": { opacity: "0" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "spotlight-descend": {
          "0%": { transform: "scaleY(0) translateY(-100%)", opacity: "0" },
          "100%": { transform: "scaleY(1) translateY(0)", opacity: "1" },
        },
      },
      animation: {
        float: "float var(--float-duration, 3s) ease-in-out infinite",
        "pulse-glow":
          "pulse-glow var(--glow-duration, 2s) ease-in-out infinite",
        "wipe-out": "wipe-out var(--wipe-duration, 0.4s) ease-in forwards",
        "crowd-pop": "crowd-pop var(--pop-duration, 0.8s) ease-out forwards",
        "score-fill":
          "score-fill var(--fill-duration, 1.2s) cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "payout-flash":
          "payout-flash var(--flash-duration, 1.5s) ease-in-out forwards",
        "slide-up": "slide-up 0.3s ease-out forwards",
        "spotlight-descend": "spotlight-descend 0.8s ease-out forwards",
      },
      backgroundImage: {
        "arena-gradient":
          "radial-gradient(ellipse at center top, #1A1A28 0%, #0A0A0F 70%)",
        "gold-gradient": "linear-gradient(135deg, #FFB800 0%, #FF8C00 100%)",
        "blue-gradient": "linear-gradient(135deg, #1A3FBE 0%, #0D2080 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
