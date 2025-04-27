// Vite configuration
//
// • root: "src"   → index.html is in client/src/
// • build.outDir  → emit build into   client/dist/   (Docker copies this)

const path  = require("path");
const react = require("@vitejs/plugin-react");
const { defineConfig } = require("vite");

module.exports = defineConfig({
  root: path.resolve(__dirname, "src"),

  plugins: [
    react({
      // Also run Babel on every *.js file so JSX parses correctly
      include: [/\.[jt]sx?$/, /\.js$/]
    })
  ],

  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
