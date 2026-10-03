import agent from '../../../stores/AgentStore.js'
import kitt from './Store.js'

export function prime(): boolean {
  return true
}

export function paint(elapsed: number, level: number, advance: boolean): void {
  if (!advance) {
    return
  }

  kitt.level = level
  if (!agent.speaking) {
    kitt.position = (kitt.position + elapsed * 6) % 16
  }
}
