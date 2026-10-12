import { selectCharacter, type Character } from '../config/character.ts'
import type {
  MediaStream,
  PcmAudioStream,
  WebSocketInstance,
  WebSocketConstructor,
} from '@geastack/core'
import type { ConversationPhase } from './phases.js'
import type { SessionStart } from './RealtimeSession.js'

declare const WebSocket: WebSocketConstructor

interface LiveEvent {
  type: string
  delta?: string
  error?: { message?: string }
  delegation?: { id: string }
}

/** GPT-Live streams continuously; it has no Realtime response or turn lifecycle. */
export class LiveSession {
  character: Character = selectCharacter()
  socket: WebSocketInstance | null = null
  audio: PcmAudioStream | null = null
  microphone: MediaStream | null = null
  audioTimer: ReturnType<typeof setInterval> | null = null
  timeout: ReturnType<typeof setTimeout> | null = null
  closeWaiter: (() => void) | null = null
  phase: ConversationPhase = 'idle'
  generation = 0
  ready = false
  lastSpeechAt = 0
  readonly notify: (message: string) => void

  constructor(notify: (message: string) => void) {
    this.notify = notify
  }

  update(phase: ConversationPhase, message: string): void {
    this.phase = phase
    this.notify(JSON.stringify({ type: 'state', phase, message }))
  }

  async start(options: SessionStart): Promise<void> {
    this.cleanup()
    const generation = this.generation

    this.character = selectCharacter(options.characterId)
    const microphone =
      options.captureMicrophone === false
        ? null
        : await navigator.mediaDevices.getUserMedia({ audio: true })

    if (generation !== this.generation) {
      for (const track of microphone?.getTracks() || []) {
        track.stop()
      }

      return
    }

    this.microphone = microphone
    this.audio = new PcmAudioStream(options.sampleRate)
    this.audioTimer = setInterval(() => this.pollAudio(), 40)
    this.update('connecting', `Connecting to ${this.character.name}…`)
    const socket = new WebSocket(
      options.realtimeUrl ?? 'wss://api.openai.com/v1/live/sessions',
      '',
      {
        headers: [{ name: 'Authorization', value: `Bearer ${options.apiKey}` }],
      },
    )

    this.socket = socket
    socket.onopen = () => {
      if (generation === this.generation) {
        socket.send(`{"type":"session.start","session":${options.sessionConfig}}`)
      }
    }

    socket.onmessage = (event) => {
      if (generation !== this.generation || typeof event.data !== 'string') {
        return
      }

      try {
        this.receive(JSON.parse(event.data) as LiveEvent)
      } catch (error) {
        this.fail(error instanceof Error ? error.message : 'Invalid Live event.')
      }
    }

    socket.onerror = () => {
      if (generation === this.generation) {
        this.fail('Connection failed. Tap Start to retry.')
      }
    }

    socket.onclose = () => {
      if (generation === this.generation) {
        this.fail('Connection closed before session finalization. Tap Start to retry.')
      }
    }

    this.timeout = setTimeout(() => {
      if (generation === this.generation && !this.ready) {
        this.fail('Connection timed out. Tap Start to retry.')
      }
    }, 20000)
  }

  pollAudio(): void {
    const audio = this.audio

    if (!audio || !this.ready || this.phase === 'closing') {
      return
    }

    const level = audio.audioLevel

    this.notify(JSON.stringify({ type: 'level', level }))
    // Live can send silence as well as speech. Use actual playback energy,
    // with a short release, rather than treating every network packet as speech.
    if (level > 0.004) {
      this.lastSpeechAt = Date.now()
      if (this.phase !== 'speaking') {
        this.update('speaking', '')
      }
    } else if (this.phase === 'speaking' && Date.now() - this.lastSpeechAt >= 240) {
      this.update('listening', 'I’m listening.')
    }
  }

  receive(event: LiveEvent): void {
    if (this.phase === 'idle' || this.phase === 'error') {
      return
    }

    if (event.type === 'session.closed') {
      if (this.phase === 'closing') {
        this.cleanup()
        this.update('idle', 'Ready when you are.')
      } else {
        this.fail('The Live session ended. Tap Start to reconnect.')
      }
    } else if (event.type === 'error') {
      this.fail(event.error?.message || 'The Live session reported an error.')
    } else if (this.phase === 'closing') {
      return
    } else if (event.type === 'session.started' && !this.ready) {
      this.ready = true
      if (this.timeout !== null) {
        clearTimeout(this.timeout)
      }

      this.timeout = null
      if (this.audio && this.socket) {
        // Microphone input stays attached while the model speaks. Live needs
        // a continuous input timeline, including silence, for full duplex.
        if (this.microphone) {
          this.audio.setInput(this.microphone)
        }

        this.audio.pipeTo(this.socket, '{"type":"session.input_audio.append","audio":"', '"}')
        this.socket.send(
          JSON.stringify({
            type: 'session.instructions.append',
            event_id: 'spark-opening',
            delegation_id: null,
            content: `Greet the user now. ${this.character.opening} Then listen.`,
          }),
        )
      }

      this.update('listening', `Connected to ${this.character.name}`)
    } else if (event.type === 'session.output_audio.delta' && this.ready && event.delta) {
      this.audio?.writeBase64(event.delta)
    } else if (event.type === 'session.delegation.created' && event.delegation) {
      // No backend is configured in Spark. Resolve a handoff explicitly so
      // an unsupported request cannot leave the model waiting indefinitely.
      this.socket?.send(
        JSON.stringify({
          type: 'session.commentary.append',
          delegation_id: event.delegation.id,
          content:
            'No backend or external tools are connected. Explain that limitation briefly; do not claim this task was performed.',
        }),
      )
    }
  }

  async stop(): Promise<void> {
    if (!this.ready || !this.socket) {
      this.cleanup()
      this.update('idle', 'Ready when you are.')

      return
    }

    this.update('closing', 'Closing…')
    this.audio?.close()
    for (const track of this.microphone?.getTracks() || []) {
      track.stop()
    }

    this.microphone = null
    await new Promise<void>((resolve) => {
      this.closeWaiter = resolve
      this.timeout = setTimeout(() => this.fail('The Live session did not confirm closure.'), 15000)
      this.socket?.send('{"type":"session.close"}')
    })
  }

  fail(message: string): void {
    this.cleanup()
    this.update('error', message)
  }

  cleanup(): void {
    ++this.generation
    if (this.timeout !== null) {
      clearTimeout(this.timeout)
    }

    if (this.audioTimer !== null) {
      clearInterval(this.audioTimer)
    }

    this.timeout = this.audioTimer = null
    this.audio?.close()
    for (const track of this.microphone?.getTracks() || []) {
      track.stop()
    }

    const socket = this.socket

    this.socket = null
    this.audio = null
    this.microphone = null
    this.ready = false
    this.lastSpeechAt = 0
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }

    const resolve = this.closeWaiter

    this.closeWaiter = null
    resolve?.()
  }
}
