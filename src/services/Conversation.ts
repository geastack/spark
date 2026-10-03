import { selectCharacter } from '../config/character.ts'
import type { Worker } from '@geastack/core'

export type ConversationPhase =
  | 'idle'
  | 'connecting'
  | 'reconnecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'closing'
  | 'error'

type ConversationListener = (phase: ConversationPhase, message: string) => void

interface ConversationUpdate {
  type: 'state' | 'level'
  phase?: ConversationPhase
  message?: string
  level?: number
}

/** The UI owns lifecycle; the native socket sender owns microphone upload. */
export class Conversation {
  readonly onChange: ConversationListener
  phase: ConversationPhase = 'idle'
  generation = 0
  startedAt = 0
  level = 0
  worker: Worker | null = null

  constructor(onChange: ConversationListener) {
    this.onChange = onChange
  }

  get audioLevel(): number {
    return this.level
  }

  update(phase: ConversationPhase, message: string): void {
    this.phase = phase
    console.log(`[Spark] ${phase} ${message} elapsed_ms ${Date.now() - this.startedAt}`)
    this.onChange(phase, message)
  }

  async start(apiKey: string, sessionConfig: string, characterId: string = 'kitt'): Promise<void> {
    if (this.worker || (this.phase !== 'idle' && this.phase !== 'error')) {
      return
    }

    if (!apiKey) {
      this.update('error', 'Set OPENAI_API_KEY in .env and rebuild.')

      return
    }

    const generation = ++this.generation

    this.startedAt = Date.now()
    this.update('connecting', `Connecting to ${selectCharacter(characterId).name}…`)
    try {
      const worker = new Worker(new URL('../workers/conversation.worker.ts', import.meta.url), {
        type: 'module',
        name: 'spark-conversation',
      })

      this.worker = worker
      worker.onmessage = (event) => {
        if (generation !== this.generation || typeof event.data !== 'string') {
          return
        }

        const update = JSON.parse(event.data) as ConversationUpdate

        if (this.phase === 'closing' && update.phase !== 'idle' && update.phase !== 'error') {
          return
        }

        if (this.phase === 'error' && update.phase === 'idle') {
          this.cleanup()

          return
        }

        if (update.type === 'level') {
          this.level = update.level || 0
        } else if (update.phase) {
          if (update.phase === 'idle' || update.phase === 'error') {
            this.cleanup()
          }

          this.update(update.phase, update.message || '')
        }
      }

      worker.onerror = (event) => {
        if (generation === this.generation) {
          this.fail(event.message || 'Conversation worker failed.')
        }
      }

      worker.postMessage(
        JSON.stringify({
          type: 'start',
          apiKey,
          sessionConfig,
          characterId,
          sampleRate: 24000,
        }),
      )
    } catch (error) {
      if (generation === this.generation) {
        this.fail(error instanceof Error ? error.message : 'Could not connect.')
      }
    }
  }

  fail(message: string): void {
    this.worker?.postMessage(JSON.stringify({ type: 'stop' }))
    this.update('error', message)
  }

  async stop(): Promise<void> {
    this.level = 0
    this.update('closing', 'Closing…')
    if (this.worker) {
      this.worker.postMessage(JSON.stringify({ type: 'stop' }))
    } else {
      this.update('idle', 'Ready when you are.')
    }
  }

  cleanup(): void {
    ++this.generation
    const worker = this.worker

    this.worker = null
    this.level = 0
    worker?.terminate()
  }
}
