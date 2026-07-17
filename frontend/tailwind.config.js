/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e8f0fe",
          100: "#dbeafe",
          200: "#c5ddf8",
          300: "#a8c7fa",
          400: "#8ab4f8",
          500: "#4285f4",
          600: "#1a73e8",
          700: "#1967d2",
          800: "#185abc",
          900: "#174ea6",
          950: "#0d3b82",
        },
        g: {
          blue: "#4285f4",
          red: "#ea4335",
          yellow: "#fbbc05",
          green: "#34a853",
          deep: "#0043ad",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-dm-sans)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Noto Sans SC",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        soft: "0 1px 6px rgba(32, 33, 36, 0.12)",
        glow: "0 4px 12px rgba(66, 133, 244, 0.35)",
        card: "0 1px 2px rgba(32, 33, 36, 0.06)",
        elevate: "0 6px 24px rgba(32, 33, 36, 0.1)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
