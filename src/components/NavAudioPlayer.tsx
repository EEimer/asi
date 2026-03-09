import { useMemo, useState } from 'react'
import { Loader2, Pause, Play, Volume2 } from 'lucide-react'
import { useAudioPlayer } from '../store/audioPlayerStore'

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
      <button
        onClick={togglePlayPause}
        disabled={!hasTrack || isLoading}
        title={hasTrack ? 'Audio Player' : 'Kein Audio aktiv'}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : isPlaying
            ? <Pause className="w-4 h-4" />
            : <Volume2 className="w-4 h-4" />}
      </button>

      {showOverlay && (
        <div className="absolute right-0 top-11 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-3 z-50">
          <p className="text-[11px] text-slate-500 mb-1">Jetzt wird abgespielt</p>
          <p className="text-sm font-medium text-slate-800 truncate">{track.title}</p>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <button
              onClick={togglePlayPause}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <span>{formatTime(effectiveDuration, '--:--')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
