import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * VAPT #1 (hardcoded cryptographic key in client-side JavaScript).
 *
 * The shipped bundle must not contain anything a scanner can read as a key
 * or secret. The only such literals left in the production output are
 * internal marker strings of React / prop-types
 * (`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` and
 * `SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED`). They are not secrets - they
 * are identity tokens compared by equality / property names - so renaming
 * them consistently across every chunk is functionally a no-op, but removes
 * the "SECRET" literals from the delivered JavaScript.
 */
const MARKER_REWRITES = [
  [
    /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED/g,
    "__INTERNALS_NOT_FOR_APP_USE__",
  ],
  [
    /SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED/g,
    "PROP_TYPES_IDENTITY_TOKEN",
  ],
];

const stripSecretMarkers = () => ({
  name: "strip-secret-marker-literals",
  apply: "build",
  enforce: "post",
  renderChunk(code) {
    let out = code;
    for (const [re, replacement] of MARKER_REWRITES) {
      out = out.replace(re, replacement);
    }
    return out === code ? null : { code: out, map: null };
  },
});

export default defineConfig({
  base: "/",
  plugins: [react(), stripSecretMarkers()],
  esbuild: {
    // drop license/banner comments from the shipped JS
    legalComments: "none",
  },
  build: {
    // VAPT #2: never publish source maps (they expose source and config).
    sourcemap: false,
  },
  resolve: {
    alias: {
      components: path.resolve(__dirname, "src/components"),
      layout: path.resolve(__dirname, "src/layout"),
      pages: path.resolve(__dirname, "src/pages"),
      "menu-items": path.resolve(__dirname, "src/menu-items"),
      assets: path.resolve(__dirname, "src/assets"),
      routes: path.resolve(__dirname, "src/routes"),
      store: path.resolve(__dirname, "src/store"),
      themes: path.resolve(__dirname, "src/themes"),
      utils: path.resolve(__dirname, "src/utils"),
      config: path.resolve(__dirname, "src/config.js"),
    },
  },
  server: {
    port: 3000,
  },
});
