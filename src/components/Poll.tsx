import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ganadoras, totalVotos } from '../lib/twitchPoll'
import type { TwitchPoll } from '../types'

/**
 * Las encuestas del canal, en la pantalla de lectura.
 *
 * Se dibujan en dos lugares y a propósito:
 *
 *  - Mientras está abierta, una tarjeta fija arriba de la lista. No puede ir
 *    mezclada entre los mensajes: cambia cada tres segundos y en un chat movido
 *    se iría de pantalla justo cuando se la quiere mirar.
 *  - Cuando cierra, una fila más en el chat con el resultado. La tarjeta se va
 *    sola a los treinta segundos, y sin esto no quedaría rastro de que hubo una
 *    encuesta ni de qué ganó.
 */

/** Cuánto falta, en el formato más corto que se entienda. */
function restante(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000))
  if (segundos < 60) return `${segundos} s`
  const minutos = Math.floor(segundos / 60)
  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`
}

/**
 * Las opciones con su barra.
 *
 * Las usan la tarjeta y la fila del chat, así que el resultado que queda
 * anotado se lee igual que lo que se estuvo mirando en vivo.
 */
function Opciones({ poll, cerrada }: { poll: TwitchPoll; cerrada: boolean }) {
  const total = totalVotos(poll)
  const ganan = cerrada ? ganadoras(poll) : []

  return (
    <ul className="cr-encuesta-opciones">
      {poll.choices.map((c) => {
        // Sin un solo voto, todas las barras quedan en cero: repartir el 100%
        // en partes iguales diría que la gente votó, y no votó nadie.
        const parte = total > 0 ? (c.votes / total) * 100 : 0

        return (
          <li key={c.id} className={ganan.includes(c.id) ? 'is-ganadora' : ''}>
            <div className="cr-encuesta-fila">
              <span className="cr-encuesta-opcion">{c.title}</span>
              <span className="cr-encuesta-numeros">
                <b>{Math.round(parte)}%</b>
                <span className="cr-encuesta-votos">
                  {c.votes} {c.votes === 1 ? 'voto' : 'votos'}
                </span>
              </span>
            </div>
            <div className="cr-encuesta-barra">
              <i style={{ width: `${parte}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * El pie: cuántos votaron en total.
 *
 * Sin votos el texto cambia según esté abierta o cerrada: "todavía" en una que
 * ya terminó promete algo que no va a pasar.
 */
function Total({ poll, cerrada }: { poll: TwitchPoll; cerrada: boolean }) {
  const total = totalVotos(poll)

  if (total === 0) {
    return <p className="cr-encuesta-total">{cerrada ? 'No votó nadie' : 'Todavía no votó nadie'}</p>
  }

  return (
    <p className="cr-encuesta-total">
      {total} {total === 1 ? 'voto' : 'votos'} en total
    </p>
  )
}

/**
 * La tarjeta de arriba, mientras la encuesta está abierta y un rato después.
 *
 * El tiempo que falta se calcula contra `endsAt`, que sale de la duración que
 * eligió la streamer. Puede llegar a cero y que la encuesta siga figurando
 * abierta unos segundos, porque el cierre lo decide Twitch y nosotros lo vemos
 * en el pedido siguiente: por eso abajo de cero dice "cerrando" en vez de
 * quedarse clavado en 0 s, que parecería que se colgó.
 */
export function TarjetaEncuesta({ poll }: { poll: TwitchPoll }) {
  const cerrada = poll.status === 'ended'
  const [ahora, setAhora] = useState(() => Date.now())

  // Un tic por segundo, y sólo mientras corre: con la encuesta cerrada el
  // número ya no cambia y no hay nada que actualizar.
  useEffect(() => {
    if (cerrada) return
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [cerrada])

  const falta = poll.endsAt - ahora
  const ganan = cerrada ? ganadoras(poll) : []
  const empate = ganan.length > 1

  return (
    <section className={`cr-encuesta ${cerrada ? 'is-cerrada' : ''}`} aria-label="Encuesta del canal">
      <header className="cr-encuesta-head">
        <span className="cr-encuesta-chip">{cerrada ? 'Encuesta terminada' : 'Encuesta'}</span>
        {cerrada ? (
          empate ? (
            <span className="cr-encuesta-reloj">Empate</span>
          ) : null
        ) : (
          <span className="cr-encuesta-reloj">
            {falta > 0 ? `quedan ${restante(falta)}` : 'cerrando…'}
          </span>
        )}
      </header>

      <h2 className="cr-encuesta-titulo">{poll.title}</h2>
      <Opciones poll={poll} cerrada={cerrada} />
      <Total poll={poll} cerrada={cerrada} />
    </section>
  )
}

/**
 * La fila que queda en el chat cuando la encuesta cerró.
 *
 * No lleva nombre ni insignias: una encuesta no la escribe nadie. Por eso se
 * dibuja aparte y no pasa por el renglón común, que arranca sí o sí con un
 * autor.
 */
export function FilaEncuesta({ poll, hora }: { poll: TwitchPoll; hora: ReactNode }) {
  const ganan = ganadoras(poll)
  const empate = ganan.length > 1
  const sinVotos = ganan.length === 0

  return (
    <article className="cr-msg is-evento is-encuesta">
      <span className="cr-evento-chip">
        {sinVotos ? 'Encuesta sin votos' : empate ? 'Encuesta terminada · empate' : 'Encuesta terminada'}
      </span>

      <p className="cr-encuesta-linea">
        {hora}
        <span className="cr-encuesta-titulo-fila">{poll.title}</span>
      </p>

      <Opciones poll={poll} cerrada />
      <Total poll={poll} cerrada />
    </article>
  )
}
