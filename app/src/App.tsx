import { Routes, Route } from 'react-router-dom'
import { PathScreen } from './screens/PathScreen'
import { GameScreen } from './screens/GameScreen'
import { AvatarScreen } from './screens/AvatarScreen'
import { ShopScreen } from './screens/ShopScreen'
import { RecordingStudio } from './dev/RecordingStudio'
import { useProgress } from './state/progress'

export default function App() {
  const font = useProgress((s) => s.settings.font)
  return (
    <div className={`app font-${font}`}>
      <Routes>
        <Route path="/" element={<PathScreen />} />
        <Route path="/les/:lessonId" element={<GameScreen />} />
        <Route path="/avatar" element={<AvatarScreen />} />
        <Route path="/winkel" element={<ShopScreen />} />
        {import.meta.env.DEV && <Route path="/opnemen" element={<RecordingStudio />} />}
      </Routes>
    </div>
  )
}
