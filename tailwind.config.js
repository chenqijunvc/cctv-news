/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./dist/**/*.{html,js}",
    "./templates/**/*.{html,js}",
    "./static/js/**/*.{html,js}"
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
      },
      colors: {
        'primary-blue': '#1E40AF',
        'primary-light': '#3B82F6',
        'primary-dark': '#1E3A8A',
        'accent-gold': '#D4AF37',
        'accent-red': '#C41E3A',
        'accent-orange': '#F59E0B',
        'success': '#10B981',
        'warning': '#F59E0B',
        'danger': '#DC2626',
        'info': '#06B6D4',
        'text-primary': '#1a1a1a',
        'text-secondary': '#64748B',
        'text-muted': '#64748B',
        'bg-primary': '#ffffff',
        'bg-secondary': '#f8fafc',
        'bg-card': '#ffffff',
        'border': '#e5e7eb',
        'divider': '#e5e7eb',
      }
    },
  },
  plugins: [],
}