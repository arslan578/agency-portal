/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'rgb(var(--background) / <alpha-value>)',
                foreground: 'rgb(var(--foreground) / <alpha-value>)',
                card: {
                    DEFAULT: 'rgb(var(--card) / <alpha-value>)',
                    foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
                },
                muted: {
                    DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
                    foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
                },
                border: 'rgb(var(--border) / <alpha-value>)',
                input: 'rgb(var(--input) / <alpha-value>)',
                ring: 'rgb(var(--ring) / <alpha-value>)',
                primary: {
                    DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
                    foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
                },
                destructive: {
                    DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
                    foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
                },
                accent: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
                },
                kaivo: {
                    // Tropical Oasis Brand Colors
                    teal: {
                        deep: '#007B5F',    // Primary - Deep emerald
                        medium: '#009688',  // Secondary - Medium teal
                        50: '#E6F5F1',      // Ultra light
                        100: '#B2E5D9',     // Light
                        200: '#80D5C6',     // Soft
                        300: '#4DB6AC',     // Aqua (same as aqua)
                        400: '#26A69A',     // Between medium and aqua
                        500: '#009688',     // Medium (brand)
                        600: '#00897B',     // Slightly darker
                        700: '#007B5F',     // Deep (brand - primary)
                        800: '#00695C',     // Rich deep
                        900: '#004D40',     // Darkest
                        // Legacy names
                        emerald: '#009B77',
                        soft: '#A8D8B9',
                        neon: '#4DB6AC',    // Aqua for compatibility
                        glow: '#009688',    // Medium for compatibility
                    },
                    aqua: '#4DB6AC',        // Brand accent
                    amber: '#FFB74D',       // Brand highlight
                    coral: '#FF7043',       // Brand energy
                    dark: {
                        bg: '#0B0F19',      // Deep Space Blue
                        card: '#141B2D',    // Slightly lighter card BG
                        border: '#1E293B',  // Border
                    },
                    gray: {
                        offWhite: '#FAFAFA',
                        light: '#F1F5F9',
                        medium: '#CBD5E1',
                        slate: '#E2E8F0',
                    },
                    text: {
                        // These use CSS variables that change with theme
                        primary: 'rgb(var(--text-primary-rgb, 15 23 42))',
                        secondary: 'rgb(var(--text-secondary-rgb, 30 41 59))',
                        muted: 'rgb(var(--text-muted-rgb, 100 116 139))',
                    }
                },
                // Override default Tailwind grays for better contrast
                gray: {
                    50: '#F8FAFC',
                    100: '#F1F5F9',
                    200: '#E2E8F0',
                    300: '#CBD5E1',
                    400: '#94A3B8',
                    500: '#64748B',
                    600: '#475569',
                    700: '#334155',
                    800: '#1E293B',
                    900: '#0F172A',
                }
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'sans-serif'],
                serif: ['var(--font-cassio)', 'serif'],
            },
            animation: {
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            }
        },
    },
    plugins: [],
}
