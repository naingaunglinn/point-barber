// Tailwind CSS 4 through PostCSS: builds packages/ui/tokens.css, the one stylesheet both route trees
// import (add-shared-ui-components design D2).
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
