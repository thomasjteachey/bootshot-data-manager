import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    entry: "src/main/index.ts",
  },
  preload: {
    input: {
      index: resolve(__dirname, "src/preload/index.ts"),
    },
  },
  renderer: {
    plugins: [react()],
  },
});
