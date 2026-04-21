/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./sidepanel/**/*.{tsx,ts}",
    "./options/**/*.{tsx,ts}",
    "./components/**/*.{tsx,ts}",
    "./contents/**/*.{tsx,ts}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)"
        },
        secondary: "var(--color-secondary)",
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)"
        },
        accent: "var(--color-accent)",
        destructive: "var(--color-destructive)",
        border: "var(--color-border)",
        ring: "var(--color-ring)",
        card: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-foreground)"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) * 0.8)",
        sm: "calc(var(--radius) * 0.6)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "pulse-dot": "pulseDot 1.5s ease-in-out infinite"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" }
        }
      }
    }
  },
  plugins: []
}
