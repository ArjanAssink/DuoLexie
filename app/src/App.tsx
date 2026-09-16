import { Routes, Route } from 'react-router-dom'
import { PathScreen } from './screens/PathScreen'
import { GameScreen } from './screens/GameScreen'
import { AvatarScreen } from './screens/AvatarScreen'
import { ShopScreen } from './screens/ShopScreen'
import { TestMenuScreen } from './screens/TestMenuScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { RecordingStudio } from './dev/RecordingStudio'
import { useProgress } from './state/progress'
import { useHydrated } from './state/hydration'

export default function App() {
  const font = useProgress((s) => s.settings.font)
  // Nothing routes until both persisted stores have loaded. Until then every screen would
  // be deciding on default values — and the onboarding gate in PathScreen decides by
  // navigating, so a returning player would be bounced to /welkom and left there
  // (state/hydration.ts, docs/onboarding-welkom.md ss3.3). The wait is tens of milliseconds
  // of the app's own background, which is why there is no spinner in here.
  const hydrated = useHydrated()
  return (
    <div className={`app font-${font}`}>
      {hydrated && (
        <Routes>
          <Route path="/" element={<PathScreen />} />
          <Route path="/welkom" element={<OnboardingScreen />} />
          <Route path="/les/:lessonId" element={<GameScreen />} />
          <Route path="/avatar" element={<AvatarScreen />} />
          <Route path="/winkel" element={<ShopScreen />} />
          <Route path="/proberen" element={<TestMenuScreen />} />
          {import.meta.env.DEV && <Route path="/opnemen" element={<RecordingStudio />} />}
        </Routes>
      )}
    </div>
  )
}
