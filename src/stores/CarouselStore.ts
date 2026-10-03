import { characterIds } from '../components/characters/registry.js'
import { Store } from '@geastack/core'
import { initialCharacter, type CharacterId } from '../config/character.js'

class CarouselStore extends Store {
  ids: CharacterId[] = [...characterIds]
  index = this.ids.indexOf(initialCharacter.id)
  offset = 0
  dragging = false
  pointer = -1
  startX = 0
  startY = 0
  startOffset = 0
  horizontal = false
  rejected = false

  get id(): CharacterId {
    return this.ids[this.index] || 'kitt'
  }

  pageSlot(id: CharacterId): number {
    const distance = (this.ids.indexOf(id) - this.index + this.ids.length) % this.ids.length

    if (distance === 0) {
      return 0
    }

    // With two characters, the same neighbor belongs on either side. Move
    // that offscreen page to the side being revealed before it becomes visible.
    if (this.ids.length === 2) {
      return this.offset < 0 ? 410 : -410
    }

    const slot = distance === this.ids.length - 1 ? -1 : distance

    return slot * 410
  }

  pointerDown(x: number, y: number, pointer: number): void {
    if (this.dragging || this.ids.length < 2) {
      return
    }

    this.dragging = true
    this.pointer = pointer
    this.startX = x
    this.startOffset = this.offset
    this.startY = y
    this.horizontal = false
    this.rejected = false
  }

  pointerMove(x: number, y: number, pointer: number): void {
    if (!this.dragging || pointer !== this.pointer || this.rejected) {
      return
    }

    const dx = x - this.startX
    const dy = y - this.startY

    if (!this.horizontal) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        this.rejected = true

        return
      }

      this.horizontal = Math.abs(dx) > 6 && Math.abs(dx) >= Math.abs(dy)
    }

    if (this.horizontal) {
      this.offset = Math.max(-410, Math.min(410, this.startOffset + dx))
    }
  }

  pointerUp(pointer: number): boolean {
    if (!this.dragging || pointer !== this.pointer) {
      return false
    }

    this.dragging = false
    this.pointer = -1
    if (this.rejected || !this.horizontal || Math.abs(this.offset) < 60) {
      return false
    }

    const forward = this.offset < 0

    this.index = (this.index + (forward ? 1 : this.ids.length - 1)) % this.ids.length
    // The revealed neighbor becomes the center without a visual jump.
    this.offset += forward ? 410 : -410

    return true
  }

  cancel(): void {
    this.dragging = false
    this.pointer = -1
  }

  animate(elapsed: number): void {
    if (this.dragging || this.offset === 0) {
      return
    }

    const next = this.offset * Math.exp(-elapsed / 55)

    this.offset = Math.abs(next) < 1 ? 0 : Math.round(next)
  }
}

export default new CarouselStore()
