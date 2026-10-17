import type { Config } from "tailwindcss";

const themedNeutral = {
  50: "rgb(var(--palette-50) / <alpha-value>)",
  100: "rgb(var(--palette-100) / <alpha-value>)",
  200: "rgb(var(--palette-200) / <alpha-value>)",
  300: "rgb(var(--palette-300) / <alpha-value>)",
  400: "rgb(var(--palette-400) / <alpha-value>)",
  500: "rgb(var(--palette-500) / <alpha-value>)",
  600: "rgb(var(--palette-600) / <alpha-value>)",
  700: "rgb(var(--palette-700) / <alpha-value>)",
  800: "rgb(var(--palette-800) / <alpha-value>)",
  900: "rgb(var(--palette-900) / <alpha-value>)",
  950: "rgb(var(--palette-950) / <alpha-value>)",
};

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand)",
          dark: "var(--brand-dark)",
        },
        slate: themedNeutral,
        gray: themedNeutral,
        zinc: themedNeutral,
        neutral: themedNeutral,
      },
    },
  },
  plugins: [],
};

export default config;
