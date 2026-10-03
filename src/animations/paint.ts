import agent from '../stores/AgentStore.js'
import carousel from '../stores/CarouselStore.js'
import { paintCharacters as paintRegisteredCharacters } from '../components/characters/paint.js'

let lastPaint = 0

export function paintCharacters(): void {
  const now = Date.now()

  if (now - lastPaint < 33) {
    return
  }

  const elapsed = lastPaint ? Math.min(100, now - lastPaint) / 1000 : 0

  lastPaint = now
  // Keep frozen pixels and clocks through dragging and snap settling.
  const advance = !carousel.dragging && carousel.offset === 0

  paintRegisteredCharacters(elapsed, agent.speaking ? agent.level : 0, carousel.id, advance)
}
