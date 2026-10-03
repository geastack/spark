import type { Character } from './character.js'

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

export function createSessionConfig(character: Character): string {
  const session: RealtimeSessionConfig = {
    type: 'realtime',
    model: 'gpt-realtime-2.1',
    max_output_tokens: 480,
    instructions: `${character.instructions}

Conversation: give complete answers in one or two brief sentences, within about fifteen seconds of speech. For a larger topic, explain one useful part and offer to continue. Listen to the actual question and avoid long monologues. You have no external tools: do not claim to have sent messages, saved reminders, checked live facts, or sensed the environment.`,
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        turn_detection: character.turnDetection ?? {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        format: { type: 'audio/pcm', rate: 24000 },
        voice: character.voice,
        speed: 1,
      },
    },
  }

  return JSON.stringify(session)
}
