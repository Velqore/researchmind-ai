import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Point Tailwind at its config explicitly — the plugin otherwise searches from
// process.cwd(), which breaks when the dev server is launched from a parent dir.
const here = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: join(here, 'tailwind.config.js') },
    autoprefixer: {},
  },
};
