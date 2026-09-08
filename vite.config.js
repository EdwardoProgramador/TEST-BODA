import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: así el build funciona igual servido desde la raíz de un
  // dominio, desde un subdirectorio de GitHub Pages o abriendo dist/ a mano.
  base: './',
  server: {
    port: 5173,
    open: true,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vendors en chunks propios: el navegador los cachea entre despliegues
        // y solo vuelve a bajar el código de la app cuando cambia.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          chart: ['chart.js']
        }
      }
    }
  }
});
