import { Audio, Display, mount, WiFi } from '@geastack/core'
import App from './components/App.js'
import agent from './stores/AgentStore.js'
import './styles/main.css'
import { paintCharacters } from './animations/paint.js'

Audio.setVolume(100)
Display.setBrightness(100)
Display.setFlushConfig({ rows: 2, depth: 2 })
WiFi.setEnabled(true)

mount(App)

function animate(): void {
  agent.animate()
  paintCharacters()
  requestAnimationFrame(animate)
}

requestAnimationFrame(animate)
