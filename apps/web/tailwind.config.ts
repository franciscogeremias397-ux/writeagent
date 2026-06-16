import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111111",
        paper: "#f7f7f4",
        line: "#e7e5df",
        muted: "#6f6b64",
        mark: "#fff2a8"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(20, 20, 20, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
