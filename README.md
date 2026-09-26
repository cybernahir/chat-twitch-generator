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
  - **Insignias**: streamer, mod, VIP, sub, prime, turbo, staff.
  - **Comportamiento**: dirección (de abajo hacia arriba o al revés), alineación,
    animación de entrada, ritmo de mensajes, cantidad en pantalla y borrado por tiempo.
- **Fuente propia**: el streamer sube su `.ttf` (también `.otf`, `.woff`, `.woff2`)
  y los mensajes pasan a usarla. También se puede pegar la URL de una fuente hosteada.
- Genera el **link para OBS** con un clic.
- **Pantalla para leer el chat** (`/chat`): aparte del overlay, una vista pensada
  para seguir el chat en un monitor al costado, con las respuestas a la vista.
  Ver [Pantalla para leer el chat](#pantalla-para-leer-el-chat-chat).

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

`/` (el editor) queda detrás del login. **`/overlay.html` y `/chat.html` quedan
públicas a propósito**: OBS no puede completar un formulario, y la pantalla de
lectura tiene que poder abrirse en cualquier monitor sin andar tipeando la
contraseña. No hay nada sensible en ninguna de las dos: muestran el chat de un
canal que ya es público. `/api/chat-badges` también es público, por el mismo
motivo, y sólo sirve arte de insignias.

Los archivos de `/assets/*` también son públicos, porque el overlay los necesita.
Alguien que conozca esas URLs podría bajarse el bundle del editor y correrlo por
su cuenta; lo que no puede es usar *tu* sitio. Para el caso de uso —que sólo tu
streamer entre a tu editor— alcanza. Si necesitaras cerrar también eso, hay que
pasar a Netlify password protection a nivel sitio (plan pago).

## Chat real: Twitch y Kick juntos

La fuente **En vivo** puede leer Twitch, Kick o **las dos a la vez**, mezcladas
en una sola lista. Cada mensaje entra cuando llega; los filtros y el recorte son
los mismos venga de donde venga.

**Marcar de qué plataforma vino** es lo que hace legible un chat mezclado, y
tiene cuatro modos:

| Modo | Qué hace |
| --- | --- |
| `No marcar` | Nada. Los mensajes se ven todos iguales. |
| `Logo de la plataforma` | El logo al principio del mensaje, del mismo alto que las insignias. |
| `Barrita de color al costado` | Borde izquierdo: morado Twitch, verde Kick. |
| `Logo y barrita` | Las dos cosas. |

Los logos se sirven desde **Simple Icons**, que publica las marcas oficiales y
deja elegir el color por URL. No están dibujados a mano: Phosphor, la librería de
iconos del proyecto, trae el de Twitch pero no el de Kick, y mezclar dos fuentes
los dejaría con distinto peso óptico. La contra es que OBS necesita internet para
mostrarlos, igual que ya lo necesita para los emotes.

Los presets que venían con la barrita prendida se migran solos a `bar`.

### Kick, sin login

Kick no tiene servidor de chat propio: usa **Pusher**, y su canal público acepta
suscripciones anónimas. Igual que con Twitch, el overlay no lleva ningún token
adentro.

Verificado contra el chat en vivo: llegan mensajes, nombres con su **color
real**, insignias (sub, mod, VIP, verificado) y **emotes**, que Kick escribe
dentro del propio mensaje como `[emote:123:nombre]` y sirve desde
`files.kick.com`.

Dos diferencias con Twitch que condicionan el diseño:

1. **Hay que traducir el nombre del canal a un id de sala**, y ese endpoint de
   Kick **no manda cabeceras CORS**: el navegador no puede pedirlo. Por eso la
   traducción la hace el editor contra `/api/kick/:slug` y el id queda guardado
   en el preset (`kickChatroomId`). El overlay se conecta derecho al WebSocket y
   no depende de nada más.
2. **La clave de Pusher es la que Kick publica en su propio frontend.** Es la vía
   que usan todos los overlays de Kick, pero no está documentada: si algún día la
   rotan hay que actualizarla en `src/lib/kickChat.ts`.

> Kick está detrás de Cloudflare. Si su protección anti-bots corta el pedido
> desde el servidor, la búsqueda falla y el id de la sala se puede **pegar a
> mano** en el campo de al lado. El overlay funciona igual.

### Por qué no se usa la API oficial de Kick

Kick tiene API oficial con OAuth 2.1, pero para leer chat entrega los eventos por
**webhook**: Kick le pega a una URL nuestra. Eso obligaría a guardar los mensajes
y que el overlay los consulte, que para un chat es demasiado lento. El WebSocket
público llega instantáneo y sin cuenta.

## Pantalla para leer el chat (`/chat`)

Aparte del overlay que va en OBS, hay una pantalla pensada para **leer** el chat
en un monitor al costado. Es otra cosa: el overlay tiene que quedar bien sobre
la escena y desaparecer; esto tiene que aguantar horas de lectura.

Trae su propio diseño —fondo oscuro parejo, texto grande, aire entre mensajes y
tamaño de letra ajustable, que se recuerda en ese navegador— y lee **Twitch y
Kick a la vez**, mezclados en una sola lista, con el logo de la plataforma al
principio de cada mensaje para saber de dónde vino.

Va como página aparte, igual que el overlay, así queda **fuera del login**: se
abre en cualquier monitor sin tener que pasar por la contraseña.

### El canal va fijo en el código

No hay presets ni parámetros en la URL: se abre `/chat` y anda. Es una pantalla
para un solo chat, y hacerla configurable sólo agregaba formas de que quedara
mal apuntada.

Los dos canales y la sala de Kick están escritos en `src/pages/ChatPage.tsx`.
La sala de Kick va anotada a mano porque el navegador no puede traducir el
nombre del canal a ese número (el endpoint de Kick no manda cabeceras CORS), y
con el canal fijo no tiene sentido pasar por el servidor en cada carga.

### Respuestas

Cuando alguien contesta a otro mensaje, arriba se muestra el original citado,
más chico y apagado.

No hay que guardar historial ni cruzar nada: las dos plataformas mandan el
mensaje original **adentro** del que contesta, texto incluido. Twitch lo pone en
los tags (`reply-parent-display-name`, `reply-parent-msg-body`), escapado como
cualquier tag de IRCv3; Kick lo pone en `metadata.original_message`. Así la
respuesta se entiende aunque el original ya se haya ido de pantalla.

### Sobrevive a un F5

El chat se guarda en el navegador, así que recargar sin querer no se lo lleva
puesto. Se restaura al abrir y sigue desde ahí.

- Se guarda cada 5 segundos, y además justo antes de irse (`pagehide`), que es
  lo que cubre el caso real: recargar o cerrar. Escribir en cada mensaje sería
  una escritura a disco por mensaje durante horas.
- Se conservan los últimos 300, con el tachado y las respuestas incluidos.
- **Lo de más de 8 horas no vuelve.** Sin ese corte, abrir la pantalla a la
  mañana mostraría el chat de anoche arriba de todo y parecería que hay gente
  hablando.

Vive en `localStorage`, o sea en ese navegador y nada más. Si está lleno o
bloqueado (navegación privada), el chat anda igual, sin memoria.

### Primer mensaje

Cuando alguien escribe por primera vez en el canal, la fila sale marcada en
verde con **Primer mensaje en el canal**, parecido al recuadro que muestra la
vista de moderación de Twitch. Sirve para poder saludar a quien recién aparece.

Lo marca Twitch en el propio mensaje (`first-msg`), así que no hay que llevar
registro de quién habló antes ni guardar nada.

Ojo con qué significa: es la primera vez que **escribe**, no que aparezca por
el canal. Capturando tráfico real se ven mensajes con esta marca de gente que
ya tiene insignia de suscriptor — estaba hace rato, pero recién hoy dijo algo.

Verde y no ámbar a propósito: el ámbar es "alguien mostró su racha", esto es
"alguien apareció por primera vez". Son cosas distintas y conviene poder
distinguirlas de un vistazo.

Frecuencia medida: 7 de cada 1539 mensajes, más o menos uno cada 220.

Existe un segundo tag (`returning-chatter`, alguien que vuelve después de mucho)
pero en la captura nunca valió más que cero, así que no se muestra: no se
implementa a ciegas algo que no se pudo ver funcionando.

Kick no manda ninguna marca equivalente.

### Rachas y suscripciones

En la lista se intercalan los avisos que Twitch manda por `USERNOTICE`, el
mismo socket anónimo que el chat. Son dos, y lo que tienen en común es lo que
los hace valer la pena: **las dos cosas son opt-in**, sólo llegan cuando la
persona eligió mostrarlas.

| Qué | Cómo se ve |
| --- | --- |
| Racha de ver el stream | `Racha de 15 streams` arriba del mensaje |
| Sub nuevo | `se suscribió` |
| Renovación | `renovó su sub · 15 meses · 9 meses seguidos` |

Las dos rachas comparten el mismo ámbar a propósito: "alguien mostró su racha"
es una sola categoría para el ojo, y el texto dice cuál de las dos es.

Dos detalles que salieron de mirar eventos reales:

- **La racha de ver el stream viene con el mensaje que la persona escribió**,
  no es un evento suelto. Por eso el mensaje se dibuja normal y la racha va
  arriba como contexto; en los subs es al revés, el aviso *es* la línea.
- **La racha de meses falta la mitad de las veces.** De cinco resubs
  capturados, dos la compartieron. Que no venga no significa que sea cero:
  significa que no la quisieron mostrar, así que no se inventa nada.

Twitch **no** dice en cada mensaje cuántos streams seguidos viene mirando
alguien; el dato existe sólo en el momento en que esa persona lo publica. Y es
esporádico: cuatro avisos en tres minutos repartidos entre 25 canales grandes.

Los regalos de sub y los raids llegan por el mismo comando pero no traen racha,
así que quedaron afuera. Kick tampoco entra: no tiene el concepto de racha y
sus subs viajan por otro canal de Pusher.

En el overlay de OBS nada de esto aparece — va detrás de una opción apagada por
defecto, igual que el tachado de los mensajes moderados.

### Limpiar

El botón **Limpiar** del encabezado vacía **sólo esta pantalla** y lo que tenía
guardado. No borra nada en Twitch ni en Kick —leyendo de forma anónima ni
siquiera se podría— y no le cambia nada a quien mire el stream. Los mensajes
que lleguen después entran normalmente.

Pide confirmación en el mismo botón (pasa a decir *¿Seguro?* y se arrepiente
solo a los 3 segundos) porque un toque sin querer se llevaría el historial
entero. Va en gris, apagado contra el fondo: es una acción de cada tanto y no
tiene por qué competir con el chat.

### Mensajes moderados

Acá los mensajes borrados **no desaparecen**: quedan tachados y en gris, con un
cartelito debajo que dice qué pasó.

Es lo contrario de lo que hace el overlay, y a propósito. En OBS un mensaje
borrado tiene que irse —si un mod lo borró porque no quería que se viera,
dejarlo en la transmisión es justo lo que se estaba evitando—. Pero esta
pantalla la mira una sola persona, y enterarse de que algo se borró es parte de
seguir el chat. Lo decide `keepDeleted` en `useChatFeed`, apagado por defecto.

**Quién lo borró casi nunca se puede mostrar**, y no es por falta de ganas:

- **Twitch no lo manda.** El `CLEARMSG` trae el id del mensaje y el nombre de
  quien lo había escrito, pero no el del moderador. Para tenerlo hay que ir a
  EventSub con un token de moderador, y esta pantalla es pública: no puede
  llevar un token adentro.
- **Kick sí lo manda en los baneos** (`banned_by` en el `UserBannedEvent`), así
  que ahí sale "Usuario expulsado por Fulano". En los mensajes sueltos tampoco.

Cuando no se sabe, el cartel dice "Mensaje borrado" a secas.

### Insignias, sin login

Las insignias reales del canal las trae `/api/chat-badges`, que es **público**.
Hizo falta una function aparte: la del editor (`/api/twitch/badges`) exige
sesión, y esta pantalla la abre alguien que no la tiene, así que desde ahí
devolvía 401 y los mensajes salían sin las insignias del canal.

Lo que expone es arte público —las mismas imágenes que ve cualquiera que entre
al canal— y del lado de Twitch va con el **token de aplicación**, que no
representa a ningún usuario. Trae las de las dos plataformas en un solo pedido y
las cachea, porque las insignias de un canal casi nunca cambian.

Si la llamada falla, el chat se lee igual: caen los iconos vectoriales de
respaldo, que alcanzan para distinguir un mod de un sub.

### Detalles que sólo importan acá

- **Los colores oscuros se aclaran.** Twitch reparte colores fijos y algunos
  —el azul puro, el bordó— sobre fondo oscuro no se leen. Se les sube la
  luminosidad manteniendo el tono, así el nombre sigue siendo "el suyo".
- **El scroll se queda quieto si subiste a releer.** Mientras estés abajo sigue
  solo; si subís, los mensajes nuevos no te arrastran y aparece un botón para
  volver.
- **Cada mensaje lleva el logo de su plataforma**, más una barrita de color al
  costado. La cabecera no repite el nombre del canal ni el de las plataformas:
  ya lo dice cada mensaje.
- **Una luz por plataforma.** Con las dos mezcladas, un "conectado" a secas
  taparía que una se cayó y faltan la mitad de los mensajes.

## Chat real de Twitch

En **Mensajes** se elige de dónde salen: `En vivo`, `Al azar` o `Los míos`.

### Sin login, y eso es a propósito

Twitch acepta conexiones **anónimas de solo lectura** a su IRC: un nick
`justinfan<números>` sin contraseña alcanza para leer cualquier canal público.
Por eso esta app no pide login de Twitch ni hace falta registrar una aplicación.

La consecuencia importante es de seguridad: como no hay ningún token, **el link
que se pega en OBS no lleva credenciales adentro**. Se puede compartir sin
riesgo. Un overlay que usara OAuth no podría decir lo mismo.

Lo que llega por esta vía, verificado contra el chat en vivo:

- mensajes y nombres, con el **color real** que cada usuario eligió
- **insignias**: streamer, mod, VIP, sub, prime, turbo, staff
- **emotes de Twitch**, servidos desde su CDN pública (tampoco pide auth)
- filtros: ocultar comandos (`!`) y ocultar usuarios (bots)
- **moderación**: lo que se borra en Twitch se borra en el overlay

El **arte original de las insignias** (Helix `/chat/badges/*`) sí pasa por la
API, pero con un **token de aplicación**, no de usuario: ver más abajo. Cuando
no está disponible se cae a iconos vectoriales.

Lo que **sí** necesitaría OAuth de usuario, y por eso no está:

- mandar mensajes al chat

Las fotos de perfil de los usuarios quedaron **fuera de alcance a pedido**, no
por una limitación técnica. Ni se muestran ni se piden, así que el overlay no
hace un solo request por usuario.

### Moderación

Si un mod borra algo, dejarlo en pantalla —y en la transmisión— es justo lo que
se estaba tratando de evitar. Twitch avisa por el mismo IRC que ya leemos, así
que no hace falta nada extra:

| Acción | Lo que manda Twitch | Qué hace el overlay |
| --- | --- | --- |
| Borrar un mensaje | `CLEARMSG` con `target-msg-id` | saca ese mensaje |
| Timeout o baneo | `CLEARCHAT` con `target-user-id` | saca todos los mensajes de esa persona |
| `/clear` | `CLEARCHAT` sin target | vacía el chat |

Los baneos se resuelven por **id de usuario**, no por nombre: Twitch avisa por
id y el nombre visible no siempre coincide con el login. El nombre queda de
respaldo.

Con las dos plataformas mezcladas en una sola lista, el borrado sólo toca los
mensajes de la que avisó: un `/clear` en Twitch no se lleva los de Kick.

En **Kick** funciona igual, por el mismo canal de Pusher que ya trae los
mensajes:

| Acción | Lo que manda Kick | Qué hace el overlay |
| --- | --- | --- |
| Borrar un mensaje | `MessageDeletedEvent` con `message.id` | saca ese mensaje |
| Timeout o baneo | `UserBannedEvent` con `user.id` | saca todos los mensajes de esa persona |
| Vaciar el chat | `ChatroomClearEvent` | vacía el chat |

Ojo con un detalle de Kick: el `id` de primer nivel de `MessageDeletedEvent` es
el del **evento**, no el del mensaje. El que sirve está en `message.id`.

Buena parte de los borrados de Kick los hace su moderación automática
(`aiModerated: true`), no una persona.

### Vincular la cuenta de Twitch

El editor tiene un botón **Conectar cuenta de Twitch** (flujo Authorization
Code). Sirve para una sola cosa: **saber el canal sin escribirlo a mano**. Es
opcional.

El `client_secret` y los tokens viven únicamente en la function y en Netlify
Blobs. **Nunca llegan al navegador**: la API sólo devuelve el nombre de la
cuenta vinculada. Se piden **cero scopes**.

### Insignias reales, incluidas las personalizadas

El botón *Traer insignias reales del canal* trae el arte que Twitch sirve para
el canal que se está leyendo: las **insignias de sub personalizadas**, las de
bits, founder, mod, VIP. Las del canal pisan a las globales, y se respeta la
versión exacta (`subscriber/9` no es el mismo dibujo que `subscriber/3`).

**No hace falta vincular ninguna cuenta, ni que el canal sea propio.** El
servidor pide las insignias con un **token de aplicación**
(`client_credentials`): lo emite la app para sí misma con el client id y el
secret, no representa a ningún usuario y sirve para cualquier canal. Alcanza con
tener cargadas las dos variables de entorno.

El id del canal sale **gratis del propio chat**: al entrar, Twitch manda un
`ROOMSTATE` con el tag `room-id`, así que no hay una llamada extra para
traducir el nombre a id. Si el chat todavía no está conectado, el servidor
resuelve el nombre con `/users?login=`.

Las insignias se guardan **dentro del preset**, así el overlay las dibuja sin
depender de que la API esté disponible. Si agrega una insignia nueva, se toca
*Actualizar insignias reales* y se guarda el preset.

Se guardan **todas**, globales incluidas: no hay forma de saber de antemano qué
insignia va a tener quien escriba —alguien puede aparecer con una de Lead
Moderator o de un evento— y la que falta no se dibuja. Para que eso no infle el
preset, de cada una se guarda **sólo el id** y el overlay rearma la URL
(`badgeUrl()` en `twitchChat.ts`): son ~530 insignias, y repetir el prefijo del
CDN en cada una costaba 20 KB de más (51,8 KB contra 30,7 KB). Los presets
viejos guardaron la URL entera y se siguen leyendo igual.

Lo que **no** llega por acá: las insignias de 7TV, BTTV y FFZ, que viven en APIs
de terceros (sus emotes tampoco se dibujan hoy).

#### Las de Kick

Kick también tiene insignias de sub propias del canal, y vienen en el **mismo
endpoint** que ya se usa para traducir el canal a id de sala, así que no hace
falta ninguna API nueva ni credenciales: se traen al tocar *Buscar la sala de
chat* y quedan guardadas en el preset.

La diferencia está en cómo se elige cuál mostrar. Twitch manda la versión exacta
(`subscriber/9`); Kick manda **los meses** que lleva suscripta la persona y hay
que buscar el tramo más alto que no los pase: con 16 meses corresponde la
insignia de 12. Por eso esa resolución vive en el overlay (`Badge.tsx`) y no en
el cliente de chat.

Se guardan en el mismo mapa que las de Twitch pero con prefijo `kick:`. Sin eso,
mostrando los dos chats a la vez, la insignia de sub de un canal pisaría a la
del otro: las dos se llaman `subscriber`.

#### Puesta en marcha

1. Crear una aplicación en <https://dev.twitch.tv/console/apps>.
2. En **OAuth Redirect URLs** poner exactamente:
   `https://TU-SITIO.netlify.app/api/twitch/callback`
3. Cargar en Netlify las variables `TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET`.

Sin esas variables el resto de la app funciona igual: el botón se reemplaza por
un aviso, el canal se escribe a mano y las insignias se dibujan con los iconos
vectoriales.

El paso 2 es sólo para el botón de vincular. Las insignias no lo usan, pero la
consola de Twitch exige cargar al menos una Redirect URL para registrar la app.

### Por qué el overlay no usa EventSub

Twitch recomienda EventSub por sobre IRC, pero acá no se puede, y la razón es
arquitectónica:

- `channel.chat.message` exige **token de usuario** (`user:read:chat`, más
  `user:bot` por WebSocket).
- El overlay que se pega en OBS es **público**: no puede llevar ese token.
- Netlify sirve funciones por request y no sostiene conexiones persistentes, así
  que tampoco puede hacer de proxy autenticado.

Por eso la lectura del chat sigue por IRC anónimo, que no necesita credenciales.
Mover esto a EventSub implicaría cambiar de hosting a uno con proceso
persistente. Lo mismo aplica a las alertas de follows, subs y raids.

### Sobre el parseo de emotes

El tag `emotes` marca dónde va cada emote con índices que cuentan **puntos de
código**, no unidades UTF-16. Si el mensaje trae un emoji fuera del plano básico
y se corta con `slice` normal, todos los emotes salen corridos de lugar. Por eso
`buildSegments` recorre con `Array.from`.

### Limitación conocida

`justinfan` nunca estuvo documentado oficialmente y Twitch viene empujando la
migración de IRC a EventSub. Hoy funciona, pero si algún día lo cierran hay que
pasar a EventSub, que sí pide OAuth y por lo tanto un backend que guarde el
token. La pieza a reescribir sería sólo `src/lib/twitchChat.ts`.

## Presets

Después del login, la primera pantalla es la biblioteca de presets. Cada preset
guarda un chat entero: la fuente, los colores, la rotación, el ritmo y el tamaño
del lienzo. Si todavía no hay ninguno, la pantalla muestra el estado vacío con el
botón para crear el primero.

En el editor, la barra de arriba tiene el nombre del preset (editable en el
mismo lugar) y **Guardar preset**. No hay autoguardado a propósito: el streamer
decide cuándo pisar lo que ya tenía. Si intenta salir con cambios sin guardar,
el navegador le pregunta antes.

### Dónde se guardan

El pedido era poder entrar desde otra computadora, y **localStorage no sirve
para eso**: vive en un navegador concreto y no viaja. Así que hay dos capas:

| Capa | Cuándo se usa | Alcance |
| --- | --- | --- |
| **Netlify Blobs**, vía `/api/presets` | Siempre que haya backend | Cualquier computadora, entrando con la clave |
| **localStorage** | Cuando no hay backend (`npm run dev`) | Sólo ese navegador |

Cuando la API responde, además se deja una copia en localStorage como caché para
que la biblioteca pinte al instante en la próxima visita. La pantalla dice cuál
de las dos está usando, así que nunca hay que adivinar.

La API está protegida con la misma sesión que el editor: `netlify/functions/presets.mts`
verifica la cookie firmada antes de tocar el store, reusando
`netlify/shared/session.ts`, el mismo módulo que usa el gate. La verificación de
seguridad está escrita una sola vez.

## Cómo funciona el link de OBS

Hay dos formatos. En los dos, lo que identifica al overlay va en el **hash**, que
nunca viaja al servidor.

### Link corto, el recomendado

```
https://tu-sitio.netlify.app/overlay.html#p=p1a2b3c4d
```

Apunta al preset guardado, y el overlay le pide la configuración a
`/api/preset/:id` al cargar. Es el que conviene pegar en OBS:

- **no cambia al editar**, así que se pega una sola vez
- la fuente propia **no viaja en la URL**, se sirve desde el preset

Con **Aplicar cambios en vivo** prendido (viene así), al guardar el preset la
fuente de navegador se actualiza sola en un par de segundos. Sin eso hay que ir a
OBS, botón derecho sobre la fuente y **Actualizar**.

### Cómo hace para verse en vivo

Netlify no sostiene conexiones persistentes, así que **no hay push**: el overlay
pregunta. Para que se sienta instantáneo sin gastar invocaciones durante toda la
transmisión, el ritmo se adapta:

| Situación | Consulta cada |
| --- | --- |
| Acaba de llegar un cambio (últimos 2 min) | 2 s |
| Nada nuevo hace rato | 15 s |
| Con la sincronización apagada | no consulta |

La lógica es que un cambio suele venir acompañado de otros: si guardó una vez,
está retocando. Cuando se queda quieta, afloja sola.

Las consultas sin novedad usan `ETag` / `If-None-Match` y responden **304 sin
cuerpo**, así que no se retransmite la configuración (que puede traer una fuente
entera). A 15 s de base, una transmisión de 6 horas son ~1.400 consultas.

Los cambios se aplican **sin reiniciar el chat**: los mensajes que ya están en
pantalla se quedan. Para eso `useChatFeed` compara el contenido por valor y no
por referencia, porque cada refresco trae un `script` nuevo aunque sea idéntico.

Push instantáneo de verdad requeriría un servicio de tiempo real (Ably, Pusher)
o mudar el hosting a uno con proceso persistente.

Requiere que los presets estén guardados en el servidor. Con presets locales
(sin backend) el editor usa el formato largo automáticamente.

### Link largo, con todo adentro

```
https://tu-sitio.netlify.app/overlay.html#c=eyJ2IjoxLCJ3aWR0aCI6NDgw…
```

Lleva la configuración entera codificada en base64url, incluida la fuente propia
como data URL. Funciona sin backend y mantiene andando los links viejos, pero
tiene dos problemas que fueron justamente los que motivaron el formato corto:

- **cambia cada vez que tocás algo**, así que hay que volver a copiarlo en OBS.
  Si no, el editor muestra una cosa y OBS otra.
- con una fuente propia queda larguísimo, y pegarlo en OBS se vuelve poco
  práctico.

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

`npm run dev` levanta sólo Vite. Alcanza para maquetar, pero **no corre nada del
backend**: no hay login, los presets van a localStorage, el link de OBS sale en
formato largo y no anda ni la búsqueda de canal de Kick ni la vinculación de
Twitch.

### Correr el backend local

Hace falta el CLI de Netlify, y con él **Node 22 o superior**, por dos motivos
distintos:

- `netlify-cli` 27 pide Node >= 22.13 para instalarse.
- Las functions usan `crypto` global, que en **ESM** aparece recién en Node 20.
  Ojo con verificarlo: `node -e` corre en CommonJS, donde Node 18 sí lo expone,
  así que ese chequeo engaña. En un `.mjs` sobre Node 18 no existe.

```bash
npm i -g netlify-cli
```

La clave de acceso se pone en un `.env` en la raíz, que ya está en `.gitignore`:

```
APP_PASSWORD=loquesea
```

Y después:

```bash
npm run dev:auth
```

Queda todo en `http://localhost:8888` (Vite por dentro en el 5173). Netlify
Blobs corre local, así que los presets se guardan de verdad.

`netlify-cli` **no es dependencia del proyecto** a propósito: pesa cientos de
megas y sólo hace falta para esto.

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
index.html                   entrada de la app     -> protegida por el gate
overlay.html                 fuente del chat       -> pública, la consume OBS
chat.html                    pantalla de lectura   -> pública, para leer el chat

netlify/
  shared/session.ts          firma y verificación de la cookie (gate + API)
  edge-functions/gate.ts     login, corre en el borde antes de servir el HTML
  functions/presets.mts      API de presets sobre Netlify Blobs
  functions/chat-badges.mts  insignias del canal, publicas (para /chat)

src/
  App.tsx                    rutas por hash: biblioteca o editor
  main.tsx                   monta la app
  overlay-main.tsx           monta el overlay
  chat-main.tsx              monta la pantalla de lectura
  defaults.ts                config por defecto, pools de usuarios/mensajes
  fonts.ts                   catálogo de fuentes + carga perezosa de Google Fonts
  types.ts                   ChatConfig, Preset y compañía
  lib/
    encode.ts                config <-> base64url en la URL
    presetStore.ts           API de presets con respaldo en localStorage
    fontStore.ts             IndexedDB + @font-face para las fuentes propias
    useHashRoute.ts          router mínimo de dos pantallas
    useChatFeed.ts           motor de mensajes simulados
    chatHistory.ts           historial de /chat en el navegador
  components/
    ChatOverlay.tsx          el render del chat (preview, miniaturas y OBS)
    ChatList.tsx             la lista de la pantalla de lectura
    Badge.tsx                insignias
    FontPicker.tsx           selector de fuentes con preview real
    CustomFontUploader.tsx   subida del .ttf
    ScriptEditor.tsx         lista de mensajes propios
    ui/Controls.tsx          sliders, colores, toggles, etc.
  pages/
    LibraryPage.tsx          biblioteca de presets con miniaturas en vivo
    EditorPage.tsx           panel de control
    OverlayPage.tsx          página transparente para OBS
    ChatPage.tsx             pantalla para leer el chat
  styles/
    app.css                  UI de la app
    overlay.css              estilos del chat
    chat.css                 estilos de la pantalla de lectura
```

## Nota

Es una implementación propia inspirada en la idea de Pixel Chat: no reutiliza
código, assets ni marca de ese sitio, y los mensajes son simulados (no se conecta
al chat real de Twitch).
