import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function emittedAudioAssets(): Plugin {
  return {
    name: "archive-defender-audio-assets",
    enforce: "pre",
    load(id) {
      if (!/\.(mp3|ogg|wav)\?url$/.test(id)) return null;
      const filePath = id.slice(0, id.indexOf("?"));
      const referenceId = this.emitFile({
        type: "asset",
        name: basename(filePath),
        source: readFileSync(filePath),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
    },
    transform(code, id) {
      if (!id.endsWith("/src/arcadeLaunch.ts")) return null;
      const openingTrack = resolve("src/game/assets/oldschool-action-theme.mp3");
      const referenceId = this.emitFile({
        type: "asset",
        name: basename(openingTrack),
        source: readFileSync(openingTrack),
      });
      const assetExpression =
        /new URL\(\s*["']\.\/game\/assets\/oldschool-action-theme\.mp3["']\s*,\s*import\.meta\.url\s*,?\s*\)\.href/;
      if (!assetExpression.test(code)) {
        this.error("Could not locate the opening-track URL expression");
      }
      return code.replace(assetExpression, `import.meta.ROLLUP_FILE_URL_${referenceId}`);
    },
  };
}

export default defineConfig({
  plugins: [emittedAudioAssets(), react()],
  build: {
    outDir: "package",
    lib: {
      entry: {
        index: "src/mod.ts",
        launch: "src/arcadeLaunch.ts",
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: "archive-defender",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom", "lucide-react"],
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith(".css"))
            ? "archive-defender.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});
