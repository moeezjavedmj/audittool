/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#080B10",
          900: "#0D1117",
          800: "#131A24",
          700: "#1B2430",
          600: "#28323F"
        },
        signal: {
          amber: "#F5A623",
          cyan: "#3FD9DB",
          red: "#FF5C5C",
          green: "#4ADE80"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(63,217,219,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(63,217,219,0.06) 1px, transparent 1px)"
      },
      backgroundSize: {
        grid: "34px 34px"
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        blink: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.25 }
        },
        rise: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" }
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(63,217,219,0.45)" },
          "100%": { boxShadow: "0 0 0 14px rgba(63,217,219,0)" }
        }
      },
      animation: {
        scan: "scan 2.2s linear infinite",
        blink: "blink 1.4s ease-in-out infinite",
        rise: "rise 0.5s ease-out both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite"
      }
    }
  },
  plugins: []
};
