import { useCallback, useEffect, useState } from 'react'
import EditorPage from './pages/EditorPage'
import LibraryPage from './pages/LibraryPage'
import { listPresets } from './lib/presetStore'
import { consumeTwitchReturn } from './lib/twitchAccount'
import { useHashRoute } from './lib/useHashRoute'
import type { Preset, PresetStorageMode } from './types'

export default function App() {
  const route = useHashRoute()
  const [presets, setPresets] = useState<Preset[]>([])
  const [mode, setMode] = useState<PresetStorageMode>('local')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const result = await listPresets()
    setPresets(result.presets)
    setMode(result.mode)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Si venimos de vincular la cuenta de Twitch, volvemos a la pantalla previa.
  useEffect(() => {
    consumeTwitchReturn()
  }, [])

  if (route.view === 'editor') {
    return (
      <EditorPage
        key={route.presetId ?? 'new'}
        presetId={route.presetId}
        presets={presets}
        mode={mode}
        loading={loading}
        onPresetsChange={(next, nextMode) => {
          setPresets(next)
          setMode(nextMode)
        }}
      />
    )
  }

  return (
    <LibraryPage
      presets={presets}
      mode={mode}
      loading={loading}
      onPresetsChange={(next, nextMode) => {
        setPresets(next)
        setMode(nextMode)
      }}
    />
  )
}
