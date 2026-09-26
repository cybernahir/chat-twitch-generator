export type ChatDirection = 'bottom' | 'top'
export type Align = 'left' | 'center' | 'right'
export type AnimationType = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'pop'
export type UsernameColorMode = 'twitch' | 'fixed' | 'inherit'
/** 'twitch' quedo de una version anterior; se migra a 'live' al cargar. */
export type SourceMode = 'random' | 'script' | 'live' | 'twitch'

export type Platform = 'twitch' | 'kick'

/** Como se marca de que plataforma vino cada mensaje. */
export type PlatformMark = 'none' | 'logo' | 'bar' | 'both'
export type LayoutMode = 'bubble' | 'flat'

export type BadgeId = 'broadcaster' | 'mod' | 'vip' | 'sub' | 'prime' | 'turbo' | 'staff'

export interface ScriptLine {
  id: string
  user: string
  text: string
  color?: string
  badges?: BadgeId[]
}

/** Un mensaje se parte en texto y emotes para poder dibujar las imagenes. */
export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'emote'; url: string; name: string }

/**
 * El mensaje al que este le contesta.
 *
 * No hay que ir a buscarlo a ningún lado: las dos plataformas mandan el
 * original adentro del mensaje que contesta, texto incluido. Así se puede
 * mostrar la respuesta aunque el original ya se haya ido de pantalla.
 */
export interface ReplyRef {
  /** Id del mensaje original, cuando la plataforma lo da. */
  id?: string
  user: string
  text: string
}

/** Nivel de suscripción. Twitch lo manda; en Kick no existe. */
export type SubTier = 'prime' | '1' | '2' | '3'

/**
 * Algo que pasó y que no es un mensaje común.
 *
 * Todo esto llega por `USERNOTICE`, el mismo socket anónimo que el chat, y va
 * mezclado en la lista porque así es como se lee: en el momento en que pasó.
 *
 * Las dos formas tienen algo en común y es lo que las hace valer la pena:
 * **las dos son opt-in**. Sólo llegan cuando la persona eligió mostrarlo.
 */
export type Notice =
  /** Se suscribió o renovó. */
  | {
      kind: 'sub' | 'resub'
      /** Meses acumulados de suscripción. */
      months?: number
      /**
       * Meses seguidos sin cortar.
       *
       * Está sólo si la persona eligió compartirla: de cada dos resubs, más o
       * menos uno la comparte. Que falte no quiere decir que sea cero, quiere
       * decir que no la quiso mostrar.
       *
       * No es lo mismo que `months`: se puede llevar 15 meses en total y 9
       * seguidos si en el medio se cortó.
       */
      streak?: number
      tier?: SubTier
    }
  /**
   * Mostró su racha de ver el stream.
   *
   * Twitch no dice en cada mensaje cuántos streams seguidos viene mirando
   * alguien: el dato llega únicamente cuando esa persona elige publicarlo, y
   * viene junto con el mensaje que escribió en ese momento.
   */
  | { kind: 'watch-streak'; streams: number }

export interface ChatMessage {
  id: string
  user: string
  text: string
  color: string
  badges: BadgeId[]
  createdAt: number
  /** Sólo cuando es una respuesta a otro mensaje. */
  reply?: ReplyRef
  /** Presente cuando lo moderaron y se eligió dejarlo tachado en vez de sacarlo. */
  deleted?: Deletion
  /**
   * Presente cuando además del mensaje pasó algo: se suscribió, renovó, o
   * mostró su racha de ver el stream.
   *
   * `text` queda con lo que la persona escribió. En los subs suele estar
   * vacío; en las rachas de visualización siempre viene algo, porque el aviso
   * se dispara justo cuando escribe.
   */
  notice?: Notice
  /**
   * Es la primera vez que esta persona escribe en el canal.
   *
   * Lo marca Twitch en el propio mensaje, así que no hay que llevar registro
   * de quién habló antes. Ojo con lo que significa: es la primera vez que
   * **escribe**, no que aparezca por el canal. Se ven mensajes con esta marca
   * de gente que ya está suscripta hace meses y recién hoy dice algo.
   *
   * Kick no manda nada equivalente.
   */
  firstMessage?: boolean
  /** Solo en mensajes reales que traen emotes. */
  segments?: MessageSegment[]
  /** Insignias crudas de Twitch (`subscriber/9`), para buscar su imagen real. */
  rawBadges?: string[]
  /** De dónde vino. Los mensajes simulados no lo traen. */
  platform?: Platform
  /**
   * Id del usuario en su plataforma.
   *
   * Hace falta para los baneos: Twitch avisa a quién banearon por id, y el
   * nombre visible puede no coincidir con el login.
   */
  userId?: string
}

/**
 * Lo que hay que sacar de pantalla cuando moderan el chat.
 *
 *  - message: borraron un mensaje suelto.
 *  - user: banearon o dieron timeout, y se van todos los mensajes de esa persona.
 *  - all: vaciaron el chat entero.
 */
export type ChatRemoval =
  | { type: 'message'; id: string; by?: string }
  | { type: 'user'; userId?: string; login?: string; by?: string }
  | { type: 'all'; by?: string }

/**
 * Marca de que un mensaje fue moderado.
 *
 * La usa la pantalla de lectura, que en vez de sacarlos los deja tachados: si
 * estás leyendo el chat querés enterarte de que algo se borró. El overlay no
 * la usa —ahí los mensajes se van, que es todo el punto de moderar.
 */
export interface Deletion {
  /**
   * Quién lo borró.
   *
   * Viene vacío casi siempre: Twitch **no** dice qué moderador borró un
   * mensaje por la conexión anónima (haría falta EventSub con un token de
   * moderador). Kick sí lo manda en los baneos.
   */
  by?: string
  /** Si se borró ese mensaje, se expulsó a la persona, o se vació el chat. */
  scope: 'message' | 'user' | 'all'
}

export interface ChatConfig {
  v: 1

  /* Lienzo */
  width: number
  height: number
  previewBg: string

  /* Layout */
  layout: LayoutMode
  direction: ChatDirection
  align: Align
  gap: number
  padX: number
  padY: number
  radius: number
  maxWidth: number
  fitContent: boolean
  nameOnOwnLine: boolean

  /* Tipografía */
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  textColor: string
  usernameColorMode: UsernameColorMode
  usernameColor: string
  usernameWeight: number
  uppercaseName: boolean
  showColon: boolean

  /* Contorno / sombra del texto */
  outlineWidth: number
  outlineColor: string
  shadowBlur: number
  shadowColor: string

  /* Burbuja */
  bgColor: string
  bgOpacity: number
  borderWidth: number
  borderColor: string
  boxShadow: number
  boxShadowColor: string

  /* Insignias */
  showBadges: boolean
  badgeSize: number
  /** `setId/version` -> URL de la imagen. Se llena al vincular la cuenta. */
  badgeImages?: Record<string, string>

  /* Perspectiva / rotación */
  perspective: number
  rotateX: number
  rotateY: number
  rotateZ: number
  scale: number

  /* Comportamiento */
  animation: AnimationType
  animationDuration: number
  fadeOutAfter: number
  maxMessages: number
  messageInterval: number
  intervalJitter: number

  /* Contenido */
  source: SourceMode
  script: ScriptLine[]
  loopScript: boolean

  /** Aplicar en vivo los cambios guardados, sin recargar la fuente en OBS. */
  liveSync: boolean

  /* Chat en vivo (source === 'live'). Se pueden usar las dos a la vez. */
  twitchChannel: string
  kickChannel: string
  /** Sala de chat de Kick, resuelta en el editor y guardada para el overlay. */
  kickChatroomId: string
  /** Marca de origen: logo, barrita del color de la plataforma, las dos o nada. */
  platformMark: PlatformMark
  hideCommands: boolean
  blockedUsers: string

  /* Fuente propia */
  customFontName?: string
  customFontUrl?: string
  customFontData?: string
}

export interface Preset {
  id: string
  name: string
  updatedAt: number
  config: ChatConfig
}

/** Dónde terminaron guardándose los presets, para poder decírselo al usuario. */
export type PresetStorageMode = 'cloud' | 'local'
