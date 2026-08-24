export type ChatDirection = 'bottom' | 'top'
export type Align = 'left' | 'center' | 'right'
export type AnimationType = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'pop'
export type UsernameColorMode = 'twitch' | 'fixed' | 'inherit'
export type SourceMode = 'random' | 'script'
export type LayoutMode = 'bubble' | 'flat'

export type BadgeId = 'broadcaster' | 'mod' | 'vip' | 'sub' | 'prime' | 'turbo' | 'staff'

export interface ScriptLine {
  id: string
  user: string
  text: string
  color?: string
  badges?: BadgeId[]
}

export interface ChatMessage {
  id: string
  user: string
  text: string
  color: string
  badges: BadgeId[]
  createdAt: number
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

  /* Avatares e insignias */
  showAvatars: boolean
  avatarSize: number
  showBadges: boolean
  badgeSize: number

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
