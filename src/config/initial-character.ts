import { selectCharacter } from './character.js'

// Startup selection is separate from the reusable character registry.
export const initialCharacter = selectCharacter(process.env.AGENT_CHARACTER)
