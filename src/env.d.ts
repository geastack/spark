import type { PcmAudioStreamConstructor } from '@geastack/core'

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly OPENAI_API_KEY: string
      readonly AGENT_CHARACTER: string
    }
  }

  // Gea replaces these .env values with string literals during the build.
  const process: {
    readonly env: {
      readonly OPENAI_API_KEY: string
      readonly AGENT_CHARACTER: string
    }
  }

  // Native PCM playback controls and amplitude meter.
  interface HTMLAudioElement {
    clearBufferedAudio(): void
    readonly audioLevel: number
  }

  const PcmAudioStream: PcmAudioStreamConstructor
}
