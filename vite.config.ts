import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    /**
     * Sólo en desarrollo: `npm run dev` levanta Vite solo, sin functions, y
     * sin esto las páginas que leen datos del servidor (/chat, /overlay con
     * link corto) no pueden cargar nada en local.
     *
     * Van **nada más que los dos endpoints públicos y de sólo lectura**, y la
     * lista es cerrada a propósito. La primera versión mandaba `/api` entero,
     * y eso incluía la API del editor: abrir el editor en local pegaba contra
     * producción sin cookie de sesión, cobraba un 401 y —como el 401 recargaba
     * la página— quedaba en un bucle de recargas contra el sitio publicado.
     * Sirvió 52.000 pedidos en una hora antes de que alguien lo notara.
     *
     * Lo que queda afuera (`/api/presets`, `/api/kick`, `/api/twitch`) no
     * resuelve en local, el `fetch` falla al parsear y los presets caen a
     * localStorage. Que es justo lo que pasaba antes de que existiera el proxy.
     *
     * No afecta al build ni a `netlify dev`, que trae sus propias functions.
     */
    proxy: {
      // Las claves que empiezan con `^` las toma Vite como expresión regular.
      // La barra final de `preset/` es la que deja afuera a `presets`.
      '^/api/chat-badges': {
        target: 'https://chat-twitch-generator.netlify.app',
        changeOrigin: true,
      },
      '^/api/preset/': {
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
