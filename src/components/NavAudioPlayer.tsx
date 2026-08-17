import { useMemo, useState } from 'react'
import { Loader2, Pause, Play, Volume2 } from 'lucide-react'
import { useAudioPlayer } from '../store/audioPlayerStore'
import { Button } from './ui'

function formatTime(seconds: number, fallback = '00:00'): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function NavAudioPlayer() {
  const { track, isPlaying, isLoading, currentTime, duration, pause, resume } = useAudioPlayer()
  const [hovered, setHovered] = useState(false)

  const effectiveDuration = useMemo(() => {
    if (duration > 0) return duration
    return track?.durationHintSeconds ?? 0
  }, [duration, track?.durationHintSeconds])

  const progress = useMemo(() => {
    if (!effectiveDuration || effectiveDuration <= 0) return 0
    return Math.max(0, Math.min(100, (currentTime / effectiveDuration) * 100))
  }, [currentTime, effectiveDuration])

  const hasTrack = !!track
  const showOverlay = hovered && hasTrack

  async function togglePlayPause() {
    if (!track || isLoading) return
    if (isPlaying) pause()
    else await resume()
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Button
        size="sm"
        variant="cancel"
        outline
        iconOnly
        onClick={togglePlayPause}
        disabled={!hasTrack || isLoading}
        title={hasTrack ? 'Audio Player' : 'Kein Audio aktiv'}
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : isPlaying
            ? <Pause className="w-4 h-4" />
            : <Volume2 className="w-4 h-4" />}
      </Button>

      {showOverlay && (
        <div className="absolute right-0 top-11 w-72 rounded-xl border border-surfaceBorder bg-panel shadow-lg p-3 z-50">
          <p className="text-[11px] text-muted mb-1">Jetzt wird abgespielt</p>
          <p className="text-sm font-medium text-content truncate">{track.title}</p>
          <div className="mt-3 h-1.5 bg-inputBg rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>{formatTime(currentTime)}</span>
            <Button size="xs" variant="cancel" outline onClick={togglePlayPause} disabled={isLoading}>
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <span>{formatTime(effectiveDuration, '--:--')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
