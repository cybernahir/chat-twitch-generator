# Chat Twitch Generator

Generador de **chat de Twitch simulado** para usar como *Browser Source* en OBS.
React + TypeScript + Vite, 100% estático (sin backend), listo para Netlify.

## Qué hace

- Simula mensajes de chat: **aleatorios** (usuarios, textos e insignias al azar) o
  **tuyos**, escribiéndolos en una lista propia con nombre, color e insignias.
- Personalización en vivo con preview:
  - **Rotación y perspectiva**: girar (Z), inclinar (X), girar (Y), perspectiva y escala.
  - **Fondo de los mensajes**: color, opacidad, redondeo, padding, borde, sombra,
    separación, ancho máximo y modo "sin fondo".
  - **Texto**: fuente, tamaño, grosor, interlineado, espaciado entre letras, color,
    contorno y sombra.
  - **Nombre de usuario**: color estilo Twitch / color fijo / igual que el texto,
    grosor, mayúsculas, en línea propia.
  - **Avatares** (iniciales con el color del usuario) e **insignias** (streamer, mod,
    VIP, sub, prime, turbo, staff).
  - **Comportamiento**: dirección (de abajo hacia arriba o al revés), alineación,
    animación de entrada, ritmo de mensajes, cantidad en pantalla y borrado por tiempo.
- **Fuente propia**: el streamer sube su `.ttf` (también `.otf`, `.woff`, `.woff2`)
  y los mensajes pasan a usarla. También se puede pegar la URL de una fuente hosteada.
- Genera el **link para OBS** con un clic.

## Acceso privado (login)

El editor está protegido por una **Netlify Edge Function** (`netlify/edge-functions/gate.ts`)
que corre en el servidor, **antes** de entregar el HTML. La clave vive en una
variable de entorno y nunca se manda al navegador, así que no se puede saltear
desde el inspector.

- Sesión sin estado: cookie `cg_session` firmada con **HMAC-SHA256**,
  `HttpOnly` + `SameSite=Lax` + `Secure`, con vencimiento a 30 días.
- Comparación de la clave en **tiempo constante** y demora de 400 ms en cada
  intento fallido, para que no sirva probar claves a lo bruto.
- Si `APP_PASSWORD` no está definida, el sitio **falla cerrado**: muestra una
  página explicando qué falta en vez de quedar abierto.
- El botón **Salir** del editor limpia la sesión (`/?logout=1`).

### Variables de entorno

En **Netlify → Site configuration → Environment variables**:

| Variable | Obligatoria | Para qué sirve |
| --- | --- | --- |
| `APP_PASSWORD` | Sí | La clave que le pasás a tu streamer. Usá una larga. |
| `SESSION_SECRET` | No | Clave para firmar las cookies. Si no la ponés se usa `APP_PASSWORD`; en ese caso, cambiar la contraseña cierra todas las sesiones abiertas (que suele ser lo que querés). |

### Qué queda protegido y qué no

`/` (el editor) queda detrás del login. **`/overlay.html` queda público a
propósito**: OBS no puede completar un formulario, así que la fuente de navegador
tiene que poder abrir la URL sin sesión. No hay nada sensible ahí — el overlay
sólo muestra mensajes inventados y su configuración viaja en el hash, que ni
siquiera llega al servidor.

Los archivos de `/assets/*` también son públicos, porque el overlay los necesita.
Alguien que conozca esas URLs podría bajarse el bundle del editor y correrlo por
su cuenta; lo que no puede es usar *tu* sitio. Para el caso de uso —que sólo tu
streamer entre a tu editor— alcanza. Si necesitaras cerrar también eso, hay que
pasar a Netlify password protection a nivel sitio (plan pago).

## Cómo funciona el link de OBS

No hay base de datos: toda la configuración se serializa a JSON, se codifica en
base64url y viaja en el **hash** de la URL:

```
https://tu-sitio.netlify.app/overlay.html#c=eyJ2IjoxLCJ3aWR0aCI6NDgw…
```

Como va en el hash, no llega al servidor y no tiene el límite de longitud de un
query string normal. Por eso el mismo mecanismo sirve para la fuente propia: el
`.ttf` se embebe como data URL dentro de la config.

> **Sobre el peso de la fuente.** Un `.ttf` de 300 KB hace que el link quede muy
> largo (funciona, pero es incómodo). Si te pasa, convertí la fuente a `.woff2`
> (suele bajar a menos de 100 KB) o pegá la URL de la fuente ya hosteada en el
> campo correspondiente — ahí el link queda cortito.

En el editor, la fuente subida además se guarda en **IndexedDB** para que siga
disponible la próxima vez que abras la página.

## Poner el overlay en OBS

1. Configurá el chat a gusto y tocá **Copiar link para OBS**.
2. En OBS: **Fuentes → + → Navegador**.
3. Pegá el link en **URL** y usá el mismo **ancho × alto** que pusiste en
   "Tamaño del lienzo" (por defecto 480 × 720).
4. Dejá tildado *Apagar la fuente cuando no esté visible* para que el chat
   arranque vacío cada vez que se muestra la escena.

El fondo de la página `/overlay` es transparente, así que sólo se ven los mensajes.

## Desarrollo

```bash
npm install
npm run dev        # Vite solo — SIN login, para trabajar cómodo
npm run dev:auth   # netlify dev — CON el login del edge function
npm run build      # genera dist/
npm run preview    # sirve dist/
npm run typecheck
```

`npm run dev` levanta sólo Vite, así que la puerta de entrada **no corre**: el
editor abre directo. Es lo práctico para desarrollar.

Para probar el login local necesitás el CLI de Netlify y la clave en el entorno:

```bash
npm i -g netlify-cli
APP_PASSWORD=loquesea npm run dev:auth
```

## Deploy en Netlify

El repo ya trae `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

**Opción A — desde la web.** Subí el repo a GitHub, entrá a Netlify → *Add new site
→ Import an existing project*, elegí el repo y confirmá (build `npm run build`,
publish `dist`).

**Opción B — por CLI.**

```bash
npm i -g netlify-cli
netlify login
netlify deploy --build          # preview
netlify deploy --build --prod   # producción
```

> **Antes de abrir el sitio**, definí `APP_PASSWORD` en las variables de entorno
> (ver *Acceso privado*). Sin esa variable el editor no deja entrar a nadie.

El edge function se despliega solo: Netlify levanta todo lo que esté en
`netlify/edge-functions/`, y el propio archivo declara qué rutas intercepta.

El sitio son dos páginas estáticas de verdad (`index.html` y `overlay.html`), sin
router del lado del cliente ni reglas de rewrite.

## Estructura

```
index.html                   entrada del editor    -> protegida por el gate
overlay.html                 entrada del overlay   -> pública, la consume OBS

netlify/edge-functions/
  gate.ts                    login: cookie firmada con HMAC, corre en el borde

src/
  main.tsx                   monta el editor
  overlay-main.tsx           monta el overlay
  defaults.ts                config por defecto, pools de usuarios/mensajes
  fonts.ts                   catálogo de fuentes + carga perezosa de Google Fonts
  types.ts                   ChatConfig y compañía
  lib/
    encode.ts                config <-> base64url en la URL
    fontStore.ts             IndexedDB + @font-face para la fuente propia
    useChatFeed.ts           motor de mensajes simulados
  components/
    ChatOverlay.tsx          el render del chat (preview y OBS usan el mismo)
    Badge.tsx                insignias
    FontPicker.tsx           selector de fuentes con preview real
    CustomFontUploader.tsx   subida del .ttf
    ScriptEditor.tsx         lista de mensajes propios
    ui/Controls.tsx          sliders, colores, toggles, etc.
  pages/
    EditorPage.tsx           panel de control
    OverlayPage.tsx          página transparente para OBS
  styles/
    app.css                  UI del editor
    overlay.css              estilos del chat
```

## Nota

Es una implementación propia inspirada en la idea de Pixel Chat: no reutiliza
código, assets ni marca de ese sitio, y los mensajes son simulados (no se conecta
al chat real de Twitch).
