import { create } from 'zustand'

export interface PlayerTrack {
  summaryId: string
  variantKey: string
  title: string
  durationHintSeconds?: number
}

interface AudioPlayerStore {
  track: PlayerTrack | null
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  error: string
  playTrack: (url: string, track: PlayerTrack) => Promise<void>
  pause: () => void
  resume: () => Promise<void>
}

const audio = new Audio()
audio.preload = 'auto'

export const useAudioPlayer = create<AudioPlayerStore>((set, get) => {
  const resolveDuration = (): number => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration
    try {
      if (audio.seekable.length > 0) {
        const end = audio.seekable.end(audio.seekable.length - 1)
        if (Number.isFinite(end) && end > 0) return end
      }
    } catch {
      // ignore
    }
    return 0
  }

  const syncTime = () => {
    set({
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: resolveDuration(),
    })
  }

  audio.onloadedmetadata = syncTime
  audio.ondurationchange = syncTime
  audio.oncanplay = syncTime
  audio.ontimeupdate = syncTime
  audio.onplay = () => set({ isPlaying: true, isLoading: false, error: '' })
  audio.onpause = () => set({ isPlaying: false })
  audio.onwaiting = () => set({ isLoading: true })
  audio.onplaying = () => set({ isLoading: false, isPlaying: true })
  audio.onended = () => set({ isPlaying: false, isLoading: false, currentTime: 0 })
  audio.onerror = () => set({ isPlaying: false, isLoading: false, error: 'Audio konnte nicht abgespielt werden.' })

  return {
    track: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    error: '',
    async playTrack(url, track) {
      set({ track, isLoading: true, error: '', currentTime: 0, duration: track.durationHintSeconds ?? 0 })
      audio.src = url
      try {
        await audio.play()
      } catch (e: any) {
        set({ isLoading: false, isPlaying: false, error: e?.message ?? 'Audio konnte nicht gestartet werden.' })
      }
    },
    pause() {
      audio.pause()
    },
    async resume() {
      if (!get().track) return
      set({ isLoading: true })
      try {
        await audio.play()
      } catch (e: any) {
        set({ isLoading: false, isPlaying: false, error: e?.message ?? 'Audio konnte nicht fortgesetzt werden.' })
      }
    },
  }
})
