import { selectCharacter, type Character } from '../config/character.ts'
import type { MediaStream, PcmAudioStream, WebSocketInstance } from '@geastack/core'
import type { ConversationPhase } from './Conversation.js'
import type { RealtimeSessionConfig } from '../config/session.js'

// The event fields this client consumes; other server events are ignored.
interface RealtimeEvent {
  type: string
  delta?: string
  item_id?: string
  response_id?: string
  content_index?: number
  error?: { code?: string; message?: string }
  audio_start_ms?: number
  audio_end_ms?: number
  response?: { id?: string; status?: 'completed' | 'cancelled' | 'failed' | 'incomplete' }
}

export interface SessionStart {
  type: 'start'
  apiKey: string
  sessionConfig: string
  characterId?: string
  sampleRate: number
}

interface PlaybackItem {
  itemId: string
  contentIndex: number
  startFrame: number
  frames: number
}

export class RealtimeSession {
  character: Character = selectCharacter()
  socket: WebSocketInstance | null = null
  audio: PcmAudioStream | null = null
  microphone: MediaStream | null = null
  audioTimer: ReturnType<typeof setInterval> | null = null
  phase: ConversationPhase = 'idle'
  generation = 0
  ready = false
  opening = false
  playing = false
  outputDone = false
  responseId = ''
  cancelledResponseId = ''
  itemId = ''
  playbackItems: PlaybackItem[] = []
  playedFrames = 0
  sampleRate = 24000
  lastPlaybackLogAt = 0
  receivedAudioFrames = 0
  timeout: ReturnType<typeof setTimeout> | null = null
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
    const config = JSON.parse(options.sessionConfig) as RealtimeSessionConfig

    this.character = selectCharacter(options.characterId)
    this.sampleRate = options.sampleRate
    const microphone = await navigator.mediaDevices.getUserMedia({ audio: true })

    if (generation !== this.generation) {
      for (const track of microphone.getTracks()) {
        track.stop()
      }

      return
    }

    this.microphone = microphone
    this.audio = new PcmAudioStream(options.sampleRate)
    this.audioTimer = setInterval(() => this.pollAudio(), 40)
    this.update('connecting', `Connecting to ${this.character.name}…`)
    const socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${config.model}`, [
      'realtime',
      `openai-insecure-api-key.${options.apiKey}`,
    ])

    this.socket = socket
    socket.onopen = () => {
      if (generation === this.generation) {
        socket.send(`{"type":"session.update","session":${options.sessionConfig}}`)
      }
    }

    socket.onmessage = (event) => {
      if (generation !== this.generation || typeof event.data !== 'string') {
        return
      }

      try {
        this.receive(JSON.parse(event.data) as RealtimeEvent)
      } catch (error) {
        this.fail(error instanceof Error ? error.message : 'Invalid realtime event.')
      }
    }

    socket.onerror = () => {
      if (generation === this.generation) {
        this.fail('Connection failed. Tap Start to retry.')
      }
    }

    socket.onclose = () => {
      if (generation === this.generation) {
        this.fail('Connection closed. Tap Start to reconnect.')
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

    if (!audio) {
      return
    }

    this.playedFrames = Math.floor((audio.playedMs * this.sampleRate) / 1000)
    this.notify(JSON.stringify({ type: 'level', level: audio.audioLevel }))
    if (this.opening && this.outputDone && audio.drained) {
      // Discard captured greeting echo before enabling microphone upload.
      if (this.microphone) {
        audio.setInput(this.microphone)
      }

      this.opening = false
      console.log('[Spark opening] playback drained; microphone upload enabled')
    }

    if (this.playing && this.outputDone && audio.drained) {
      this.playing = false
      this.itemId = ''
      this.update('listening', 'I’m listening.')
    }

    const now = Date.now()

    if (now - this.lastPlaybackLogAt >= 2000) {
      this.lastPlaybackLogAt = now
      console.log(
        `[Spark native] packets=${audio.capturePackets} pending_ms=${audio.capturePendingMs} dropped=${audio.captureDroppedSamples} playback_ms=${audio.queuedMs} played_ms=${audio.playedMs} received_ms=${Math.floor((this.receivedAudioFrames * 1000) / this.sampleRate)}`,
      )
    }
  }

  resetPlayback(interrupted = false): void {
    this.playedFrames = 0
    this.receivedAudioFrames = 0
    this.playbackItems = []
    this.audio?.resetPlayback(interrupted)
    this.notify(JSON.stringify({ type: 'level', level: 0 }))
  }

  interrupt(): void {
    const playedFrames = Math.floor(((this.audio?.playedMs || 0) * this.sampleRate) / 1000)
    const items = this.playbackItems

    this.cancelledResponseId = this.responseId
    this.resetPlayback(true)
    if (this.playing && items.length) {
      let audibleIndex = 0

      for (let index = 1; index < items.length; index++) {
        if (items[index]!.startFrame <= playedFrames) {
          audibleIndex = index
        }
      }

      const audible = items[audibleIndex]!
      const heardFrames = Math.max(0, Math.min(audible.frames, playedFrames - audible.startFrame))
      const audioEndMs = Math.floor((heardFrames * 1000) / this.sampleRate)

      console.log(
        `[Spark truncate] item=${audible.itemId} content=${audible.contentIndex} response_played_ms=${Math.floor((playedFrames * 1000) / this.sampleRate)} item_end_ms=${audioEndMs} item_duration_ms=${Math.floor((audible.frames * 1000) / this.sampleRate)}`,
      )
      this.socket?.send(
        JSON.stringify({
          type: 'conversation.item.truncate',
          item_id: audible.itemId,
          content_index: audible.contentIndex,
          audio_end_ms: audioEndMs,
        }),
      )

      // Truncation removes later content in this item, but separate assistant
      // items need deleting too: the user never heard those queued responses.
      let lastDeletedItem = audible.itemId

      for (let index = audibleIndex + 1; index < items.length; index++) {
        const later = items[index]!

        if (later.itemId !== lastDeletedItem && later.itemId !== audible.itemId) {
          this.socket?.send(
            JSON.stringify({ type: 'conversation.item.delete', item_id: later.itemId }),
          )
          lastDeletedItem = later.itemId
        }
      }
    }

    this.itemId = ''
    this.playing = false
    this.outputDone = false
    this.update('listening', 'I’m listening.')
  }

  receive(event: RealtimeEvent): void {
    if (this.phase === 'idle' || this.phase === 'closing' || this.phase === 'error') {
      return
    }

    if (event.type !== 'response.output_audio.delta' && !event.type.endsWith('.delta')) {
      console.log(
        `[Spark event] type=${event.type} response=${event.response?.id || event.response_id || ''} status=${event.response?.status || ''} audio_start_ms=${event.audio_start_ms || 0} audio_end_ms=${event.audio_end_ms || 0}`,
      )
    }

    if (event.type === 'session.updated' && !this.ready) {
      this.ready = true
      if (this.timeout !== null) {
        clearTimeout(this.timeout)
        this.timeout = null
      }

      this.opening = true
      if (this.audio && this.socket) {
        this.audio.pipeTo(this.socket, '{"type":"input_audio_buffer.append","audio":"', '"}')
      }

      this.socket?.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            // Response instructions replace the session instructions. Retain
            // the character's voice and personality when requesting a greeting.
            instructions: `${this.character.instructions}\n\nOpening turn: ${this.character.opening}`,
          },
        }),
      )
      this.update('listening', `Connected to ${this.character.name}`)
    } else if (event.type === 'input_audio_buffer.speech_started' && !this.opening) {
      console.log(`[Spark turn] speech_started playing=${this.playing} played=${this.playedFrames}`)
      this.interrupt()
    } else if (event.type === 'response.created') {
      // Every response owns its own speaker queue. Server generation can finish
      // before local playback, so a new response must preempt that unplayed tail.
      if (this.playing) {
        this.interrupt()
      }

      this.responseId = event.response?.id || ''
      this.outputDone = false
      this.update('thinking', 'One moment…')
    } else if (event.type === 'response.output_audio.delta') {
      if (
        !event.delta ||
        (event.response_id &&
          (event.response_id === this.cancelledResponseId || event.response_id !== this.responseId))
      ) {
        return
      }

      if (!this.playing) {
        this.resetPlayback()
        this.itemId = event.item_id || ''
        this.playing = true
        this.update('speaking', '')
      }

      // PCM16 bytes must exclude base64 padding. Bound truncation to the
      // exact audio received for its item, rather than the whole response.
      const padding = event.delta.endsWith('==') ? 2 : event.delta.endsWith('=') ? 1 : 0
      const frames = Math.floor((Math.floor((event.delta.length * 3) / 4) - padding) / 2)
      const lastIndex = this.playbackItems.length - 1
      let item = this.playbackItems[lastIndex]
      const itemId = event.item_id || this.itemId
      const contentIndex = event.content_index || 0

      if (!item || item.itemId !== itemId || item.contentIndex !== contentIndex) {
        item = { itemId, contentIndex, startFrame: this.receivedAudioFrames, frames: 0 }
        this.playbackItems.push(item)
      }

      item.frames += frames
      this.receivedAudioFrames += frames
      this.audio?.writeBase64(event.delta)
    } else if (
      event.type === 'response.done' &&
      (event.response?.status === 'completed' || event.response?.status === 'incomplete') &&
      event.response.id === this.responseId &&
      this.responseId !== this.cancelledResponseId
    ) {
      // One response can contain several audio items. An individual item's
      // audio-done event does not mean all output for this response is done.
      this.outputDone = true
    } else if (
      (event.type === 'response.cancelled' ||
        (event.type === 'response.done' && event.response?.status === 'cancelled')) &&
      (event.response?.id || event.response_id) === this.responseId &&
      this.responseId !== this.cancelledResponseId
    ) {
      this.interrupt()
    } else if (event.type === 'response.done' && event.response?.status === 'failed') {
      this.fail('The model could not complete its reply. Tap Start to retry.')
    } else if (event.type === 'error') {
      this.fail(event.error?.message || 'The realtime session reported an error.')
    }
  }

  fail(message: string): void {
    this.cleanup()
    this.update('error', message)
  }

  stop(): void {
    this.cleanup()
    this.update('idle', 'Ready when you are.')
  }

  cleanup(): void {
    this.generation++
    if (this.timeout !== null) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    const socket = this.socket
    const audio = this.audio
    const microphone = this.microphone

    if (this.audioTimer !== null) {
      clearInterval(this.audioTimer)
    }

    this.audioTimer = null

    this.socket = null
    this.audio = null
    this.microphone = null
    this.ready = this.opening = this.playing = this.outputDone = false
    this.responseId = this.cancelledResponseId = this.itemId = ''
    this.playedFrames = 0
    this.playbackItems = []
    audio?.close()
    for (const track of microphone?.getTracks() || []) {
      track.stop()
    }

    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
  }
}
