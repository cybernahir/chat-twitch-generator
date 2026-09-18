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

export interface ChatMessage {
  id: string
  user: string
  text: string
  color: string
  badges: BadgeId[]
  createdAt: number
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
  | { type: 'message'; id: string }
  | { type: 'user'; userId?: string; login?: string }
  | { type: 'all' }

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
