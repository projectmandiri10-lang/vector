/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        background: '#FAFAFF',
        foreground: '#111827',
        card: '#FFFFFF',
        cardForeground: '#111827',
        muted: '#F3ECFF',
        mutedForeground: '#6B7280',
        'muted-foreground': '#6B7280',
        border: '#E5DBF7',
        input: '#E5DBF7',
        primary: '#7C3AED',
        primaryForeground: '#FFFFFF',
        'primary-foreground': '#FFFFFF',
        secondary: '#EDE9FE',
        secondaryForeground: '#3B0764',
        'secondary-foreground': '#3B0764',
        accent: '#FDE68A',
        accentForeground: '#92400E',
        'accent-foreground': '#92400E',
        destructive: '#EF4444',
        destructiveForeground: '#FFFFFF',
        'destructive-foreground': '#FFFFFF',
        ink: '#1F2937',
        panel: '#FBFAFF',
        line: '#E5DBF7',
        spruce: '#7C3AED',
        tomato: '#F97316',
        chart: {
          2: '#2563EB',
          3: '#F59E0B',
          4: '#14B8A6',
          5: '#EC4899'
        }
      }
    }
  },
  plugins: []
};
