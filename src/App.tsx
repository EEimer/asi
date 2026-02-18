import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Youtube, FileText, Settings } from 'lucide-react'
import BrowseView from './views/BrowseView'
import SummariesView from './views/SummariesView'
import SummaryDetailView from './views/SummaryDetailView'
import SettingsView from './views/SettingsView'
import ToastStack from './components/ToastStack'
import ProcessingConsole from './components/ProcessingConsole'

const navItems = [
  { to: '/browse', label: 'Browse', icon: Youtube },
  { to: '/summaries', label: 'Zusammenfassungen', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <ToastStack />
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-4 flex items-center gap-6 h-14">
          <div className="flex items-center gap-2 mr-4">
            <span className="text-xl font-bold text-slate-900">ASI</span>
          </div>
          <nav className="flex gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`
              }>
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<BrowseView />} />
          <Route path="/summaries" element={<SummariesView />} />
          <Route path="/summaries/:id" element={<SummaryDetailView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
      <ProcessingConsole />
    </div>
  )
}
