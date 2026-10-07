import { useEffect, useRef, useState } from 'react'
import type { TwitchPoll } from '../types'

/**
 * La encuesta que está corriendo en el canal.
 *
 * Las encuestas **no** llegan por el chat: no viajan por IRC y la conexión
 * anónima no las ve nunca. Hay que preguntarle a Twitch, con el token de la
 * cuenta vinculada, y eso pasa del lado del servidor en `/api/chat-poll`. Acá
 * sólo se pregunta cada tanto.
 *
 * Preguntar en vez de que Twitch empuje (EventSub) es a propósito. EventSub por
 * WebSocket necesita que alguien cree la suscripción *con el token del canal*
 * para la sesión de cada cliente, o sea un endpoint público que gasta
 * suscripciones de la cuenta a pedido de cualquiera; y del lado del servidor no
 * se puede sostener el socket, porque las functions son efímeras. Para algo que
 * dura entre 15 segundos y media hora, preguntar cada 3 segundos alcanza.
 */

const ENDPOINT = '/api/chat-poll'

/** Con una encuesta abierta. Los votos se mueven rápido al principio. */
const CADA_ACTIVA = 3000

/**
 * Sin nada abierto.
 *
 * No es un número al azar: cada vuelta es una invocación de la function, y la
 * pantalla queda abierta todo el stream. A 25 segundos, ocho horas salen unas
 * 1150 llamadas; a 5 segundos serían 5760. Como la encuesta recién empezada no
 * tiene votos igual, entrar un rato tarde no se pierde nada.
 */
const CADA_QUIETA = 25000

/** Cuánto queda el resultado en pantalla después de que se cierra. */
const RESULTADO_MS = 30000

interface Respuesta {
  poll: TwitchPoll | null
  motivo?: string
}

/**
 * Devuelve la encuesta que hay que dibujar, o `null`.
 *
 * `alCerrarse` se llama una sola vez por encuesta, cuando una que se vio
 * abierta pasa a terminada. Sirve para dejar el resultado anotado en el chat,
 * que es lo que queda cuando la tarjeta se va.
 */
export function useTwitchPoll(alCerrarse?: (poll: TwitchPoll) => void): TwitchPoll | null {
  const [poll, setPoll] = useState<TwitchPoll | null>(null)

  // En un ref para que cambiar el callback no reinicie el ciclo de pedidos.
  const avisar = useRef(alCerrarse)
  avisar.current = alCerrarse

  useEffect(() => {
    let vivo = true
    let timer = 0

    /** Encuestas que esta pantalla vio abiertas, y de cuáles ya avisó. */
    const vistasAbiertas = new Set<string>()
    const avisadas = new Set<string>()

    const programar = (ms: number) => {
      if (!vivo) return
      window.clearTimeout(timer)
      timer = window.setTimeout(vuelta, ms)
    }

    const vuelta = async () => {
      if (!vivo) return

      // Con la pestaña tapada no hay nadie mirando: no tiene sentido gastar
      // invocaciones. Al volver se pide enseguida, abajo.
      if (document.hidden) return programar(CADA_QUIETA)

      let data: Respuesta | null = null
      try {
        const res = await fetch(ENDPOINT, { cache: 'no-store' })
        data = res.ok ? ((await res.json()) as Respuesta) : null
      } catch {
        /* sin backend (npm run dev sin proxy) o sin red: se reintenta después */
      }

      if (!vivo) return

      const actual = data?.poll ?? null

      if (!actual) {
        setPoll(null)
        return programar(CADA_QUIETA)
      }

      if (actual.status === 'active') {
        vistasAbiertas.add(actual.id)
        setPoll(actual)
        return programar(CADA_ACTIVA)
      }

      // Terminada. El aviso sale sólo si la vimos abierta: si no, es una
      // encuesta vieja que Twitch sigue devolviendo y que ya nadie estaba
      // mirando, y no corresponde anotarla ahora en el chat.
      if (vistasAbiertas.has(actual.id) && !avisadas.has(actual.id)) {
        avisadas.add(actual.id)
        avisar.current?.(actual)
      }

      const desdeQueCerro = Date.now() - (actual.endedAt ?? actual.endsAt)
      if (desdeQueCerro < RESULTADO_MS) {
        setPoll(actual)
        // Se vuelve seguido para que el resultado se vaya a horario y no
        // cuando toque el pedido lento.
        return programar(CADA_ACTIVA)
      }

      setPoll(null)
      return programar(CADA_QUIETA)
    }

    const alVolver = () => {
      if (!document.hidden) programar(0)
    }

    document.addEventListener('visibilitychange', alVolver)
    void vuelta()

    return () => {
      vivo = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  return poll
}

/** Total de votos de una encuesta. */
export function totalVotos(poll: TwitchPoll): number {
  return poll.choices.reduce((suma, c) => suma + c.votes, 0)
}

/**
 * Las opciones más votadas.
 *
 * Devuelve varias cuando hay empate, que pasa seguido con pocos votos. Sin
 * ningún voto no gana nadie: una encuesta que nadie votó no tiene ganadora.
 */
export function ganadoras(poll: TwitchPoll): string[] {
  const mayor = Math.max(...poll.choices.map((c) => c.votes), 0)
  if (mayor <= 0) return []
  return poll.choices.filter((c) => c.votes === mayor).map((c) => c.id)
}
