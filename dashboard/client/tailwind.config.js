/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dashboard: {
          base: "#070b14",
          surface: "#0f172a",
          card: "#111827",
          accent: "#38bdf8",
          accent2: "#a78bfa",
          ok: "#34d399",
          warn: "#fbbf24",
        },
      },
      animation: {
        pulsebar: "pulsebar 0.55s ease-out",
      },
      keyframes: {
        pulsebar: {
          "0%": { opacity: "1", transform: "scaleX(1.02)" },
          "100%": { opacity: "1", transform: "scaleX(1)" },
        },
      },
    },
  },
  plugins: [],
};
