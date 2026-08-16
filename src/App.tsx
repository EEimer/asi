import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Youtube, FileText, Gem, StickyNote, Settings, X as XIcon } from 'lucide-react'
import BrowseView from './views/BrowseView'
import SummariesView from './views/SummariesView'
import SummaryDetailView from './views/SummaryDetailView'
import GlaskugelView from './views/GlaskugelView'
import NotesView from './views/NotesView'
import SettingsView from './views/SettingsView'
import XView from './views/XView'
import ToastStack from './components/ToastStack'
import ProcessingConsole from './components/ProcessingConsole'
import NavAudioPlayer from './components/NavAudioPlayer'

const navItems = [
  { to: '/browse', label: 'Browse', icon: Youtube },
  { to: '/summaries', label: 'Zusammenfassungen', icon: FileText },
  { to: '/glaskugel', label: 'Glaskugel', icon: Gem },
  { to: '/notes', label: 'Notizen', icon: StickyNote },
  { to: '/x', label: 'X', icon: XIcon },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  return (
    <div className="min-h-screen pb-12">
      <ToastStack />
      <header className="app-header border-b border-surfaceBorder bg-panel sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 flex items-center gap-6 h-14">
          <div className="flex items-center gap-2 mr-4">
            <Youtube className="w-6 h-6 text-red-600" />
            <div className="leading-none">
              <span className="text-base font-bold text-content tracking-tight">YouTube</span>
              <span className="block text-[10px] font-medium text-dim tracking-wide uppercase">Assistent</span>
            </div>
          </div>
          <nav className="flex gap-1 flex-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${isActive ? 'bg-primary/10 dark:bg-primary/[0.16] text-accentText font-medium' : 'text-muted hover:bg-rowHover hover:text-content'}`
              }>
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <NavAudioPlayer />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowseView />} />
          <Route path="/summaries" element={<SummariesView />} />
          <Route path="/summaries/:id" element={<SummaryDetailView />} />
          <Route path="/glaskugel" element={<GlaskugelView />} />
                    <Route path="/notes" element={<NotesView />} />
          <Route path="/x" element={<XView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
      <ProcessingConsole />
    </div>
  )
}
