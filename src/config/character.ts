import { characters } from '../components/characters/registry.ts'
import type { CharacterId } from '../components/characters/registry.js'
import type { TurnDetectionConfig } from './session.js'

export type { CharacterId } from '../components/characters/registry.js'
export interface Character {
  id: CharacterId
  name: string
  voice: string
  instructions: string
  opening: string
  turnDetection?: TurnDetectionConfig
}

export function selectCharacter(id: string = 'kitt'): Character {
  const character = characters.find((character) => character.id === (id || 'kitt'))

  if (!character) {
    throw new Error(
      `Unknown AGENT_CHARACTER. Choose ${characters.map((character) => character.id).join(', ')}.`,
    )
  }

  return character
}

// Gea embeds .env values in both the UI and conversation worker at build time.
export const initialCharacter = selectCharacter(process.env.AGENT_CHARACTER)
