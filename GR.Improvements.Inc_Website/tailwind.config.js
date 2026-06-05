/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html'],
  theme: {
    extend: {
      colors: {
        't900': '#0F2D3D',
        't800': '#1A3D50',
        't700': '#1E5068',
        't600': '#267A94',
        't500': '#2E8FA5',
        't400': '#4AACBE',
        't200': '#A8DCE8',
        't100': '#E6F4F8',
        'or':   '#E8730A',
        'or-dk':'#C8620A',
      },
      fontFamily: {
        heading: ['Montserrat', 'sans-serif'],
        body:    ['Open Sans', 'sans-serif'],
        mono:    ['Roboto Mono', 'monospace'],
      },
      boxShadow: {
        'card':   '0 2px 12px rgba(15,45,61,0.08)',
        'card-lg':'0 8px 32px rgba(15,45,61,0.14)',
        'or':     '0 4px 20px rgba(232,115,10,0.30)',
        'teal':   '0 4px 20px rgba(46,143,165,0.28)',
      },
    }
  },
  plugins: [],
}
