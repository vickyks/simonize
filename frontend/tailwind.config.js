/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3 Variable"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      colors: {
        clinical: {
          page: '#f8fafc',
          ink: '#0f172a',
          muted: '#475569',
          line: '#dbe3ef',
          primary: '#2563eb',
          primaryDark: '#1d4ed8',
        },
      },
      boxShadow: {
        card: '0 12px 30px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}
