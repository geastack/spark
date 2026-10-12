import type { Character } from './types.js'

export interface TurnDetectionConfig {
  type: 'semantic_vad' | 'server_vad'
  eagerness?: 'low' | 'medium' | 'high' | 'auto'
  threshold?: number
  prefix_padding_ms?: number
  silence_duration_ms?: number
  create_response: boolean
  interrupt_response: boolean
}

export interface RealtimeSessionConfig {
  type: 'realtime'
  model: string
  max_output_tokens?: number
  instructions: string
  audio: {
    input: {
      format: { type: 'audio/pcm'; rate: 24000 }
      turn_detection: TurnDetectionConfig
    }
    output: { format: { type: 'audio/pcm'; rate: 24000 }; voice: string; speed: number }
  }
}

export interface LiveSessionConfig {
  model: string
  instructions: string
  audio: {
    format: { type: 'audio/pcm'; rate: 24000 }
    output: { voice: string }
  }
}

export function createSessionConfig(character: Character): string {
  const session: LiveSessionConfig = {
    model: 'gpt-live-1',
    instructions: `${character.instructions}

Conversation: give complete answers in one or two brief sentences, within about fifteen seconds of speech. For a larger topic, explain one useful part and offer to continue. Listen to the actual question and avoid long monologues.

Backchannel policy: Acknowledge naturally and briefly without competing with the user.
Interruption policy: Stop speaking when the user interrupts and listen.
Delegation policy: No backend is connected. Do not delegate requests or claim to have sent messages, saved reminders, checked live facts, or sensed the environment. Explain any limitation honestly.`,
    audio: {
      format: { type: 'audio/pcm', rate: 24000 },
      output: {
        voice: character.voice,
      },
    },
  }

  return JSON.stringify(session)
}
