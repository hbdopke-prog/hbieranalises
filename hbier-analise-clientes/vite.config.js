import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // separa bibliotecas pesadas: o navegador guarda em cache e não rebaixa a cada versão do app
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
