import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // Dos entradas reales: el editor queda detrás del gate y el overlay,
      // que tiene que ser accesible para OBS, no. Las rutas se resuelven
      // contra el root del proyecto.
      input: {
        main: 'index.html',
        overlay: 'overlay.html',
      },
    },
  },
})
