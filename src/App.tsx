import { useRoute } from './router'
import { Home } from './pages/Home'
import { ProblemPage } from './pages/ProblemPage'

export function App() {
  const route = useRoute()
  return route.name === 'problem' ? <ProblemPage id={route.id} /> : <Home />
}
