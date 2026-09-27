/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/**/*.{js,ts,jsx,tsx}", "./src/client/index.html"],
  theme: {
    extend: {
      colors: {
        manisk: {
          bg: '#0A0A0F',
          surface: '#14141E',
          surface2: '#1C1C2A',
          border: '#2A2A3D',
          primary: '#7C3AED',
          primary2: '#A78BFA',
          accent: '#06B6D4',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          text: '#EDE9FE',
          muted: '#9CA3AF'
        }
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
