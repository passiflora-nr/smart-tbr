// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  // Pinned, not defaulted: POST /api/books/[id]/delete is a cookie-authenticated
  // hard delete driven by a plain HTML form, so it is forgeable from another site
  // the moment this is off. Turning it off to unblock a webhook route would be a
  // silent security regression — exempt that route another way instead.
  security: { checkOrigin: true },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
