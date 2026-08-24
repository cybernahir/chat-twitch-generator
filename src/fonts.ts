export interface FontDef {
  /** Nombre de la familia tal cual lo pide Google Fonts */
  family: string
  /** Categoría para agrupar el selector */
  group:
    | 'Sans serif'
    | 'Display'
    | 'Pixel / retro'
    | 'Gaming / tech'
    | 'Monoespaciada'
    | 'Manuscrita'
    | 'Serif'
    | 'Terror'
  /** Pesos que le pedimos a Google Fonts */
  weights?: number[]
}

export const CUSTOM_FONT_FAMILY = '__custom__'

export const FONTS: FontDef[] = [
  // Sans serif
  { family: 'Inter', group: 'Sans serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Roboto', group: 'Sans serif', weights: [400, 500, 700, 900] },
  { family: 'Open Sans', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Montserrat', group: 'Sans serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', group: 'Sans serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Lato', group: 'Sans serif', weights: [400, 700, 900] },
  { family: 'Nunito', group: 'Sans serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Raleway', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Rubik', group: 'Sans serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Work Sans', group: 'Sans serif', weights: [400, 500, 600, 700, 800] },
  { family: 'DM Sans', group: 'Sans serif', weights: [400, 500, 700] },
  { family: 'Manrope', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Outfit', group: 'Sans serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Figtree', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Plus Jakarta Sans', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Sora', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Barlow', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Cabin', group: 'Sans serif', weights: [400, 600, 700] },
  { family: 'Karla', group: 'Sans serif', weights: [400, 600, 700, 800] },
  { family: 'Quicksand', group: 'Sans serif', weights: [400, 600, 700] },
  { family: 'Comfortaa', group: 'Sans serif', weights: [400, 600, 700] },
  { family: 'Signika', group: 'Sans serif', weights: [400, 600, 700] },

  // Display
  { family: 'Bebas Neue', group: 'Display', weights: [400] },
  { family: 'Anton', group: 'Display', weights: [400] },
  { family: 'Oswald', group: 'Display', weights: [400, 600, 700] },
  { family: 'Teko', group: 'Display', weights: [400, 600, 700] },
  { family: 'Kanit', group: 'Display', weights: [400, 600, 700, 800] },
  { family: 'Fredoka', group: 'Display', weights: [400, 600, 700] },
  { family: 'Baloo 2', group: 'Display', weights: [400, 600, 700, 800] },
  { family: 'Bungee', group: 'Display', weights: [400] },
  { family: 'Luckiest Guy', group: 'Display', weights: [400] },
  { family: 'Titan One', group: 'Display', weights: [400] },
  { family: 'Bangers', group: 'Display', weights: [400] },
  { family: 'Righteous', group: 'Display', weights: [400] },
  { family: 'Lilita One', group: 'Display', weights: [400] },
  { family: 'Passion One', group: 'Display', weights: [400, 700, 900] },
  { family: 'Rowdies', group: 'Display', weights: [400, 700] },
  { family: 'Bowlby One SC', group: 'Display', weights: [400] },

  // Pixel / retro
  { family: 'Press Start 2P', group: 'Pixel / retro', weights: [400] },
  { family: 'VT323', group: 'Pixel / retro', weights: [400] },
  { family: 'Silkscreen', group: 'Pixel / retro', weights: [400, 700] },
  { family: 'Pixelify Sans', group: 'Pixel / retro', weights: [400, 600, 700] },
  { family: 'Jersey 10', group: 'Pixel / retro', weights: [400] },
  { family: 'Micro 5', group: 'Pixel / retro', weights: [400] },
  { family: 'Handjet', group: 'Pixel / retro', weights: [400, 700] },

  // Gaming / tech
  { family: 'Orbitron', group: 'Gaming / tech', weights: [400, 600, 700, 900] },
  { family: 'Audiowide', group: 'Gaming / tech', weights: [400] },
  { family: 'Russo One', group: 'Gaming / tech', weights: [400] },
  { family: 'Chakra Petch', group: 'Gaming / tech', weights: [400, 600, 700] },
  { family: 'Exo 2', group: 'Gaming / tech', weights: [400, 600, 700, 800] },
  { family: 'Rajdhani', group: 'Gaming / tech', weights: [400, 600, 700] },
  { family: 'Saira Condensed', group: 'Gaming / tech', weights: [400, 600, 700, 800] },

  // Monoespaciadas
  { family: 'JetBrains Mono', group: 'Monoespaciada', weights: [400, 600, 700, 800] },
  { family: 'Fira Code', group: 'Monoespaciada', weights: [400, 600, 700] },
  { family: 'Roboto Mono', group: 'Monoespaciada', weights: [400, 600, 700] },
  { family: 'Source Code Pro', group: 'Monoespaciada', weights: [400, 600, 700, 900] },
  { family: 'Space Mono', group: 'Monoespaciada', weights: [400, 700] },
  { family: 'IBM Plex Mono', group: 'Monoespaciada', weights: [400, 600, 700] },

  // Manuscritas
  { family: 'Lobster', group: 'Manuscrita', weights: [400] },
  { family: 'Pacifico', group: 'Manuscrita', weights: [400] },
  { family: 'Caveat', group: 'Manuscrita', weights: [400, 600, 700] },
  { family: 'Permanent Marker', group: 'Manuscrita', weights: [400] },
  { family: 'Shadows Into Light', group: 'Manuscrita', weights: [400] },
  { family: 'Indie Flower', group: 'Manuscrita', weights: [400] },
  { family: 'Architects Daughter', group: 'Manuscrita', weights: [400] },
  { family: 'Gloria Hallelujah', group: 'Manuscrita', weights: [400] },

  // Serif
  { family: 'Playfair Display', group: 'Serif', weights: [400, 600, 700, 900] },
  { family: 'Merriweather', group: 'Serif', weights: [400, 700, 900] },
  { family: 'Cinzel', group: 'Serif', weights: [400, 600, 700, 900] },
  { family: 'Bitter', group: 'Serif', weights: [400, 600, 700] },
  { family: 'Lora', group: 'Serif', weights: [400, 600, 700] },

  // Terror
  { family: 'Creepster', group: 'Terror', weights: [400] },
  { family: 'Nosifer', group: 'Terror', weights: [400] },
  { family: 'Eater', group: 'Terror', weights: [400] },
]

export const FONT_GROUPS = Array.from(new Set(FONTS.map((f) => f.group)))

const loaded = new Set<string>()

/** Inyecta el <link> de Google Fonts para una familia, una sola vez. */
export function ensureGoogleFont(family: string): void {
  if (!family || family === CUSTOM_FONT_FAMILY || loaded.has(family)) return
  const def = FONTS.find((f) => f.family === family)
  if (!def) return
  loaded.add(family)

  const weights = def.weights?.length ? def.weights : [400]
  const spec = def.family.replace(/ /g, '+') + ':wght@' + weights.join(';')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap'
  document.head.appendChild(link)
}

/** Pila CSS final que usa el overlay. */
export function fontStack(family: string, customName?: string): string {
  if (family === CUSTOM_FONT_FAMILY) {
    return `"${customName || 'Custom Font'}", system-ui, sans-serif`
  }
  const def = FONTS.find((f) => f.family === family)
  const fallback =
    def?.group === 'Monoespaciada'
      ? 'ui-monospace, monospace'
      : def?.group === 'Serif'
        ? 'Georgia, serif'
        : 'system-ui, sans-serif'
  return `"${family}", ${fallback}`
}
