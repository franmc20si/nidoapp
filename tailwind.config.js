/**
 * NOT CURRENTLY WIRED IN — `nativewind` is not a project dependency, no file
 * uses `className`, and nothing in babel.config.js / metro.config.js loads
 * this file. The app's real design tokens live in constants/theme.ts (C, R,
 * FONT) and constants/nidoColors.ts. Kept here (mirroring those tokens,
 * instead of the previous unrelated placeholder palette) so it can't mislead
 * anyone into designing against the wrong colors, and so it's correct on day
 * one if nativewind is ever actually installed and adopted.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:      '#F4EEE1',
        paperSoft:  '#FAF6EC',
        paperDeep:  '#EAE1CD',
        card:       '#FFFDF8',
        ink:        '#211C17',
        ink2:       '#5A4F44',
        ink3:       '#978876',
        line:       '#E2D8C4',
        brand:      '#C2502F',
        brandWash:  '#F6E3D7',
        danger:     '#c0392b',
        dangerTint: '#FEF3F2',
        dangerLine: '#FECDCA',
      },
    },
  },
  plugins: [],
};
