import { Store } from '@geastack/core'
import { Conversation, type ConversationPhase } from '../services/Conversation.js'
import { selectCharacter } from '../config/character.js'
import carousel from './CarouselStore.js'
import { createSessionConfig } from '../config/session.js'

let animationWindow = 0
let animationTicks = 0
let speakingTicks = 0
let longestAnimationGap = 0

class AgentStore extends Store {
  phase: ConversationPhase = 'idle'
  message = 'Ready when you are.'
  level = 0
  lastFrame = 0

  get notice(): string {
    return this.phase === 'error' || this.phase === 'reconnecting' ? this.message : ''
  }

  get active(): boolean {
    return this.phase !== 'idle' && this.phase !== 'error'
  }

  get speaking(): boolean {
    return this.phase === 'speaking'
  }

  animate(): void {
    const now = Date.now()
    const gap = this.lastFrame ? now - this.lastFrame : 33
    const elapsed = this.lastFrame ? Math.min(100, now - this.lastFrame) : 33

    if (!animationWindow) {
      animationWindow = now
    }

    ++animationTicks
    if (this.speaking) {
      ++speakingTicks
    }

    longestAnimationGap = Math.max(longestAnimationGap, gap)
    if (now - animationWindow >= 2000) {
      if (this.active) {
        console.log(
          `[Spark animation] window_ms ${now - animationWindow} ticks ${animationTicks} speaking_ticks ${speakingTicks} max_gap_ms ${longestAnimationGap}`,
        )
      }

      animationWindow = now
      animationTicks = speakingTicks = longestAnimationGap = 0
    }

    carousel.animate(elapsed)
    this.lastFrame = now

    const visualElapsed = carousel.id === 'kitt' ? elapsed * 1.5 : elapsed

    if (this.speaking) {
      // Immediate attack; KITT's lamps settle 1.5x faster than the other visuals.
      const target = Math.min(1, conversation.audioLevel * 5)
      const next =
        target >= this.level
          ? target
          : target + (this.level - target) * Math.exp(-visualElapsed / 65)

      // The display uses 8-bit alpha. Avoid reactive work below that precision.
      this.level = Math.round(next * 255) / 255
    } else {
      this.level = Math.round(this.level * Math.exp(-visualElapsed / 160) * 255) / 255
    }
  }

  characterChanged(): void {
    this.level = 0
    if (this.active && this.phase !== 'closing') {
      void conversation.stop()
    }
  }

  async toggle(): Promise<void> {
    if (this.phase === 'closing') {
      return
    }

    if (this.active) {
      await conversation.stop()
    } else {
      const character = selectCharacter(carousel.id)

      await conversation.start(
        process.env.OPENAI_API_KEY,
        createSessionConfig(character),
        character.id,
      )
    }
  }
}

const agent = new AgentStore()
const conversation = new Conversation((phase, message) => {
  agent.phase = phase
  agent.message = message
  if (phase === 'idle' || phase === 'error') {
    agent.level = 0
  }
})

export default agent
