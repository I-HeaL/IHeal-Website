/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                kth: {
                    blue: '#1954A6',
                    dark: '#002661',
                    gold: '#C49F30', // Metallic accent
                    gray: '#E6E6E6', // Light gray background
                }
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
