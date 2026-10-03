import assert from 'node:assert/strict'
import test from 'node:test'
import type { MediaStream, PcmAudioStream, WebSocketInstance } from '@geastack/core'
import { selectCharacter } from '../src/config/character.ts'
import { RealtimeSession } from '../src/services/RealtimeSession.ts'

function setup() {
  const outbound: string[] = []
  const received: string[] = []
  const resets: boolean[] = []
  let attachments = 0
  let pipes = 0
  const audio = {
    playedMs: 100,
    queuedMs: 0,
    audioLevel: 0,
    drained: false,
    capturePackets: 0,
    capturePendingMs: 0,
    captureDroppedSamples: 0,
    setInput() {
      ++attachments
    },
    pipeTo(_socket: WebSocketInstance, prefix: string, suffix: string) {
      ++pipes
      assert.deepEqual(JSON.parse(prefix + 'AAAA' + suffix), {
        type: 'input_audio_buffer.append',
        audio: 'AAAA',
      })
    },
    readBase64() {
      return ''
    },
    receiveFrom() {
      throw new Error('This session uses protocol-controlled audio writes')
    },
    writeBase64(data: string) {
      received.push(data)
    },
    resetPlayback(interrupted = false) {
      resets.push(interrupted)
    },
    close() {},
  } as PcmAudioStream
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    send(message: string) {
      outbound.push(message)
    },
    close() {},
  } as WebSocketInstance
  const session = new RealtimeSession(() => {})

  session.audio = audio
  session.microphone = {
    getTracks() {
      return []
    },
  } as unknown as MediaStream
  session.socket = socket
  session.phase = 'connecting'

  return { session, audio, outbound, received, resets, counts: () => [attachments, pipes] }
}

test('microphone upload waits for the complete opening to drain, then survives barge-in', () => {
  const { session, audio, counts } = setup()

  assert.deepEqual(counts(), [0, 0])
  session.receive({ type: 'session.updated' })
  session.receive({ type: 'session.updated' })
  assert.deepEqual(counts(), [0, 1], 'native sender is ready but receives no microphone input')
  session.receive({ type: 'response.created', response: { id: 'opening' } })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'opening',
    item_id: 'greeting',
    delta: 'AAAA',
  })
  session.receive({ type: 'input_audio_buffer.speech_started' })
  assert.equal(session.playing, true, 'the opening must not interrupt itself')
  session.receive({ type: 'response.done', response: { id: 'opening', status: 'completed' } })
  session.pollAudio()
  assert.deepEqual(counts(), [0, 1], 'generation finished but the speaker has not drained')
  Object.assign(audio, { drained: true })
  session.pollAudio()
  session.pollAudio()
  assert.deepEqual(counts(), [1, 1], 'start one fresh native reader after audible completion')
  session.interrupt()
  assert.deepEqual(counts(), [1, 1], 'interruption must not detach or restart microphone upload')
})

test('completion requires both protocol done and actual native playback drain', () => {
  const { session, audio } = setup()

  session.receive({ type: 'response.created', response: { id: 'r1' } })
  session.receive({ type: 'response.output_audio.delta', response_id: 'r1', delta: 'AAAA' })
  session.pollAudio()
  assert.equal(session.phase, 'speaking')
  session.receive({ type: 'response.done', response: { id: 'r1', status: 'completed' } })
  session.pollAudio()
  assert.equal(session.phase, 'speaking')
  Object.assign(audio, { drained: true })
  session.pollAudio()
  assert.equal(session.phase, 'listening')
})

test('barge-in flushes native playback, truncates audible time and rejects late audio', () => {
  const { session, outbound, resets, received } = setup()

  session.receive({ type: 'response.created', response: { id: 'r1' } })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'item1',
    delta: 'A'.repeat(6400),
  })
  session.receive({ type: 'input_audio_buffer.speech_started' })
  assert.equal((JSON.parse(outbound[0]!) as { audio_end_ms: number }).audio_end_ms, 100)
  assert.equal(resets.at(-1), true)
  session.receive({ type: 'response.output_audio.delta', response_id: 'r1', delta: 'BBBB' })
  assert.deepEqual(received, ['A'.repeat(6400)])
})

test('older responses cannot resume playback after consecutive interruptions', () => {
  const { session, received } = setup()

  session.receive({ type: 'response.created', response: { id: 'old' } })
  session.interrupt()
  session.receive({ type: 'response.created', response: { id: 'new' } })
  session.interrupt()
  session.receive({ type: 'response.output_audio.delta', response_id: 'old', delta: 'AAAA' })
  session.receive({ type: 'response.output_audio.done', response_id: 'old' })
  assert.equal(received.length, 0)
  assert.equal(session.outputDone, false)
})

test('Stop during microphone acquisition releases the late stream without starting transport', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let resolve: ((stream: MediaStream) => void) | undefined
  let stopped = 0

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((done) => {
            resolve = done
          }),
      },
    },
  })
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'navigator')
    }
  })
  const session = new RealtimeSession(() => {})
  const starting = session.start({
    type: 'start',
    apiKey: 'key',
    sessionConfig: '{"model":"test"}',
    sampleRate: 24000,
  })

  session.stop()
  resolve?.({ getTracks: () => [{ stop: () => ++stopped }] } as unknown as MediaStream)
  await starting
  assert.equal(stopped, 1)
  assert.equal(session.audio, null)
  assert.equal(session.socket, null)
  assert.equal(session.phase, 'idle')
})

test('a new response preempts an older unplayed tail instead of appending replies', () => {
  const { session, received, resets, outbound } = setup()

  session.receive({ type: 'response.created', response: { id: 'old' } })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'old',
    item_id: 'old-item',
    delta: 'AAAA',
  })
  session.receive({ type: 'response.output_audio.done', response_id: 'old' })
  session.receive({ type: 'response.created', response: { id: 'new' } })
  assert.equal(resets.at(-1), true)
  assert.equal(session.playing, false)
  assert.equal((JSON.parse(outbound[0]!) as { item_id: string }).item_id, 'old-item')
  session.receive({ type: 'response.output_audio.delta', response_id: 'old', delta: 'BBBB' })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'new',
    item_id: 'new-item',
    delta: 'CCCC',
  })
  assert.deepEqual(received, ['AAAA', 'CCCC'])
  assert.equal(session.itemId, 'new-item')
})

test('server cancellation flushes playback even without a delivered speech-start event', () => {
  const { session, resets } = setup()

  session.receive({ type: 'response.created', response: { id: 'r1' } })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'item1',
    delta: 'AAAA',
  })
  session.receive({ type: 'response.done', response: { id: 'r1', status: 'cancelled' } })
  assert.equal(resets.at(-1), true)
  assert.equal(session.playing, false)
})

test('multi-item interruption uses the audible item clock and deletes unheard items', () => {
  const { session, audio, outbound } = setup()

  session.receive({ type: 'response.created', response: { id: 'r1' } })
  for (const [itemId, milliseconds] of [
    ['first', 3900],
    ['second', 12000],
    ['third', 1000],
  ] as const) {
    session.receive({
      type: 'response.output_audio.delta',
      response_id: 'r1',
      item_id: itemId,
      delta: Buffer.alloc(milliseconds * 48).toString('base64'),
    })
  }

  Object.assign(audio, { playedMs: 9576 })
  session.interrupt()
  assert.deepEqual(
    outbound.map((message) => JSON.parse(message) as unknown),
    [
      {
        type: 'conversation.item.truncate',
        item_id: 'second',
        content_index: 0,
        audio_end_ms: 5676,
      },
      { type: 'conversation.item.delete', item_id: 'third' },
    ],
  )
})

test('item audio-done does not finish a response and truncation excludes base64 padding', () => {
  const { session, audio, outbound } = setup()

  session.receive({ type: 'response.created', response: { id: 'r1' } })
  session.receive({
    type: 'response.output_audio.delta',
    response_id: 'r1',
    item_id: 'first',
    delta: Buffer.alloc(4802).toString('base64'),
  })
  session.receive({ type: 'response.output_audio.done', response_id: 'r1' })
  Object.assign(audio, { drained: true, playedMs: 9576 })
  session.pollAudio()
  assert.equal(session.phase, 'speaking')
  assert.equal(session.receivedAudioFrames, 2401)
  session.interrupt()
  assert.equal((JSON.parse(outbound[0]!) as { audio_end_ms: number }).audio_end_ms, 100)
})

test('the opening follows the selected session character rather than the boot default', () => {
  const { session, outbound } = setup()

  session.character = selectCharacter('flora')
  session.receive({ type: 'session.updated' })
  const opening = outbound
    .map((data) => JSON.parse(data) as { type: string; response?: { instructions: string } })
    .find((event) => event.type === 'response.create')

  assert.match(opening?.response?.instructions || '', /Flora/)
  assert.match(opening?.response?.instructions || '', /mindfulness companion/)
  assert.doesNotMatch(opening?.response?.instructions || '', /KITT/)
  assert.equal(session.opening, true, 'new characters retain greeting echo holdoff')
})
