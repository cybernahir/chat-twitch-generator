import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      /**
       * Sólo en desarrollo: `npm run dev` levanta Vite solo, sin functions, y
       * sin esto las páginas que leen un preset guardado (/chat, /overlay con
       * link corto) no pueden cargar nada en local.
       *
       * Apunta al sitio publicado, que sirve los presets por un endpoint
       * público y de sólo lectura. Lo que sí pide sesión (la API del editor)
       * responde 401 y el editor cae a localStorage, igual que antes.
       *
       * No afecta al build ni a `netlify dev`, que trae sus propias functions.
       */
      '/api': {
        target: 'https://chat-twitch-generator.netlify.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // El editor queda detrás del gate. El overlay (que consume OBS) y la
      // pantalla de lectura del chat no, porque ninguno de los dos puede
      // atravesar un formulario de login. Las rutas se resuelven contra el
      // root del proyecto.
      input: {
        main: 'index.html',
        overlay: 'overlay.html',
        chat: 'chat.html',
      },
    },
  },
})
