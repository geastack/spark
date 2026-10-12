// Silent on-device reproduction: set gea.entry to this file before building.
// Exercise the normal network speech decoder and playback without a microphone.
import { Audio, Display, mount, WiFi } from '@geastack/core'
import App from '../src/components/App.js'
import agent from '../src/stores/AgentStore.js'
import carousel from '../src/stores/CarouselStore.js'
import { paintCharacters } from '../src/animations/paint.js'
import type { RealtimeSessionConfig } from '../src/config/session.js'
import { selectCharacter } from '../src/config/character.js'
import type { ConversationPhase } from '../src/services/Conversation.js'
import '../src/styles/main.css'

Audio.setVolume(0)
Display.setBrightness(100)
Display.setFlushConfig({ rows: 2, depth: 2 })
WiFi.setEnabled(true)
carousel.index = carousel.ids.indexOf('flora')
mount(App)

const worker = new Worker(new URL('./flora-audio.worker.ts', import.meta.url), {
  type: 'module',
  name: 'spark-silent-diagnostic',
})

worker.onmessage = (event) => {
  if (typeof event.data !== 'string') {
    return
  }

  const update = JSON.parse(event.data) as {
    type: string
    phase?: ConversationPhase
    message?: string
    level?: number
  }

  if (update.phase) {
    agent.phase = update.phase
    agent.message = update.message || ''
    console.log(`[Flora diagnostic] ${update.phase}`)
  }
}

// Preserve the original renderer stress workload independently of Spark's
// production model and protocol. This worker still uses RealtimeSession.
const character = selectCharacter('flora')
const sessionConfig: RealtimeSessionConfig = {
  type: 'realtime',
  model: 'gpt-realtime-2.1',
  max_output_tokens: 4096,
  instructions: character.instructions,
  audio: {
    input: {
      format: { type: 'audio/pcm', rate: 24000 },
      turn_detection: {
        type: 'semantic_vad',
        eagerness: 'medium',
        create_response: true,
        interrupt_response: true,
      },
    },
    output: {
      format: { type: 'audio/pcm', rate: 24000 },
      voice: character.voice,
      speed: 1,
    },
  },
}

worker.postMessage(
  JSON.stringify({
    type: 'start',
    apiKey: process.env.OPENAI_API_KEY,
    sessionConfig: JSON.stringify(sessionConfig),
    characterId: 'flora',
    sampleRate: 24000,
    captureMicrophone: false,
  }),
)

function animate(): void {
  agent.animate()
  // Hold the largest leaf geometry while real audio exercises task scheduling.
  agent.level = 1
  paintCharacters()
  requestAnimationFrame(animate)
}

console.log('[Flora diagnostic] network speech test started; volume 0; microphone disabled')
requestAnimationFrame(animate)
