import { characters } from '../components/characters/registry.ts'
import type { Character } from './types.js'

export type { Character, CharacterId } from './types.js'

export function selectCharacter(id: string = 'kitt'): Character {
  const character = characters.find((character) => character.id === (id || 'kitt'))

  if (!character) {
    throw new Error(
      `Unknown AGENT_CHARACTER. Choose ${characters.map((character) => character.id).join(', ')}.`,
    )
  }

  return character
}
