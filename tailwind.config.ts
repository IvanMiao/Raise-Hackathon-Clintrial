import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#f9f7f4",
        charcoal: "#1a1a1a",
        forest: "#2d4f3f",
        ghost: "#eae7e2",
        "ghost-deep": "#8a8580",
        "green-dot": "#4caf50",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      animation: {
        "fade-up": "fade-up 1s cubic-bezier(0.22, 1, 0.36, 1) both",
        "ghost-in": "ghost-in 2s ease-out both",
        "laser-scan": "laser-scan 2.5s infinite linear",
        "path-dash": "path-dash 20s linear infinite",
      },
      keyframes: {
        "fade-up": {
          "from": { opacity: "0", transform: "translateY(14px)" },
          "to": { opacity: "1", transform: "translateY(0)" },
        },
        "ghost-in": {
          "from": { opacity: "0" },
          "to": { opacity: "1" },
        },
        "laser-scan": {
          "0%": { top: "0%" },
          "50%": { top: "98%" },
          "100%": { top: "0%" },
        },
        "path-dash": {
          "to": { strokeDashoffset: "-1000" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
