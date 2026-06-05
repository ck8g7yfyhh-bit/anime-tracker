/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 請確認這裡完全依照這個格式
        fascinate: ["Fascinate", "cursive"],
      },
    },
  },
  plugins: [],
}