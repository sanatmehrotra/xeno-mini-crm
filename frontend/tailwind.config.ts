import type { Config } from "tailwindcss";

// Tailwind v4 reads tokens from @theme in globals.css.
// This file is kept for IDE autocomplete and content paths.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
