import { Store } from '@geastack/core'

class KittStore extends Store {
  level = 0
  position = 0
  cells = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  segments = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  sideSegments = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

  glow(index: number): number {
    const forward = this.position <= 8
    const head = Math.round(forward ? this.position : 16 - this.position)
    const behind = (head - index) * (forward ? 1 : -1)

    // Keep the scanner head at full brightness.
    if (index === head) {
      return 1
    }

    return behind > 0 ? Math.max(0.06, 0.55 - behind * 0.16) : 0.06
  }

  voiceGlow(segment: number, scale: number): number {
    const distance = Math.abs(segment - 8.5)
    const reach = Math.min(1, this.level * 1.875) * 9 * scale
    // Fade the outer lamps over a 2.5-segment edge.
    const edge = Math.max(0, Math.min(1, (reach - distance + 1.25) / 2.5))
    const brightness = edge * edge * (3 - 2 * edge)

    return Math.round((0.025 + brightness * Math.min(0.975, this.level * 3)) * 255) / 255
  }
}

export default new KittStore()
