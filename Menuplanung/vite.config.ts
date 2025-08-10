import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Lade Umgebungsvariablen aus der .env-Datei im Root-Verzeichnis
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      // Füge das React-Plugin hinzu
      react()
    ],
    build: {
      rollupOptions: {
        // Diese Zeile teilt Vite mit, das @google/genai-Paket nicht zu bündeln.
        // Dies löst das Kompatibilitätsproblem mit dem Build-Tool.
        external: ['@google/genai']
      }
    },
    define: {
      // Stelle den API-Schlüssel sicher für den Frontend-Code bereit
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      // Definiere einen Alias für einfachere Import-Pfade
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
