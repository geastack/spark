import type { TurnDetectionConfig } from './session.js'

export type CharacterId = 'kitt' | 'echo' | 'flora' | 'nova'

export interface Character {
  id: CharacterId
  name: string
  voice: string
  instructions: string
  opening: string
  turnDetection?: TurnDetectionConfig
}
