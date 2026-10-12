import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { selectCharacter } from '../src/config/character.ts'
import { createSessionConfig } from '../src/config/session.ts'
import { LiveSession } from '../src/services/LiveSession.ts'
import type { MediaStream, PcmAudioStream, WebSocketInstance } from '@geastack/core'

function setup(t: TestContext) {
  const sent: string[] = []
  const played: string[] = []
  let attachments = 0
  let pipes = 0
  let stopped = 0
  let closed = 0
  let connection: unknown[] = []
  let captureTime = 0
  const audio = {
    audioLevel: 0,
    drained: false,
    setInput() {
      ++attachments
    },
    pipeTo(_socket: WebSocketInstance, prefix: string, suffix: string) {
      ++pipes
      assert.deepEqual(JSON.parse(prefix + 'AAAA' + suffix), {
        type: 'session.input_audio.append',
        audio: 'AAAA',
      })
    },
    writeBase64(data: string) {
      played.push(data)
    },
    close() {},
  } as unknown as PcmAudioStream
  const socket = {
    readyState: 1,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(message: string) {
      sent.push(message)
    },
    close() {
      ++closed
    },
  } as WebSocketInstance
  const names = ['navigator', 'PcmAudioStream', 'WebSocket'] as const
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  const session = new LiveSession(() => {})

  t.after(() => {
    session.cleanup()
    names.forEach((name, index) => {
      const descriptor = descriptors[index]

      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor)
      } else {
        Reflect.deleteProperty(globalThis, name)
      }
    })
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        async getUserMedia() {
          captureTime = sent.length

          return {
            getTracks: () => [
              {
                stop() {
                  ++stopped
                },
              },
            ],
          } as unknown as MediaStream
        },
      },
    },
  })
  Object.defineProperty(globalThis, 'PcmAudioStream', {
    configurable: true,
    value: class {
      constructor() {
        return audio
      }
    },
  })
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: class {
      constructor(...args: unknown[]) {
        connection = args

        return socket
      }
    },
  })

  return {
    session,
    audio,
    socket,
    sent,
    played,
    counts: () => ({ attachments, pipes, stopped, closed, captureTime }),
    connection: () => connection,
  }
}

test('all personas start Live with bearer auth and continuous microphone input', async (t) => {
  const { session, socket, sent, counts, connection } = setup(t)

  for (const id of ['kitt', 'nova', 'echo', 'flora']) {
    const character = selectCharacter(id)
    const sessionConfig = createSessionConfig(character)
    const config = JSON.parse(sessionConfig)

    assert.equal(config.model, 'gpt-live-1')
    assert.equal(config.audio.output.voice, character.voice)
    assert.deepEqual(config.audio.format, { type: 'audio/pcm', rate: 24000 })
    assert.equal(config.audio.input, undefined, 'Realtime turn detection is not a Live setting')
    assert.equal(config.max_output_tokens, undefined)
    await session.start({
      type: 'start',
      apiKey: 'test-key',
      characterId: id,
      sessionConfig,
      sampleRate: 24000,
    })
    assert.deepEqual(connection(), [
      'wss://api.openai.com/v1/live/sessions',
      '',
      {
        headers: [{ name: 'Authorization', value: 'Bearer test-key' }],
      },
    ])
    socket.onopen!()
    assert.deepEqual(JSON.parse(sent.at(-1)!), { type: 'session.start', session: config })
    const before = counts()

    session.receive({ type: 'session.started' })
    session.receive({ type: 'session.started' })
    assert.equal(counts().attachments, before.attachments + 1)
    assert.equal(counts().pipes, before.pipes + 1)
    assert.equal(session.phase, 'listening')
    assert.deepEqual(JSON.parse(sent.at(-1)!), {
      type: 'session.instructions.append',
      event_id: 'spark-opening',
      delegation_id: null,
      content: `Greet the user now. ${character.opening} Then listen.`,
    })
    session.cleanup()
  }
})

test('continuous silence does not animate speech and playback needs no response-done event', async (t) => {
  const { session, socket, audio, played, counts } = setup(t)
  let now = 1000

  t.mock.method(Date, 'now', () => now)
  await session.start({ type: 'start', apiKey: 'test', sessionConfig: '{}', sampleRate: 24000 })
  socket.onopen!()
  session.receive({ type: 'session.started' })
  session.receive({ type: 'session.output_audio.delta', delta: 'AAAA' })
  session.pollAudio()
  assert.deepEqual(played, ['AAAA'])
  assert.equal(session.phase, 'listening')
  Object.assign(audio, { audioLevel: 0.1 })
  session.pollAudio()
  assert.equal(session.phase, 'speaking')
  assert.equal(counts().attachments, 1, 'microphone remains attached during output')
  Object.assign(audio, { audioLevel: 0 })
  now += 200
  session.pollAudio()
  assert.equal(session.phase, 'speaking', 'short pauses do not flicker the animation')
  now += 40
  session.pollAudio()
  assert.equal(session.phase, 'listening', 'continuous quiet output can remain queued')
})

test('Stop waits for Live finalization before releasing the socket', async (t) => {
  const { session, sent, counts, played } = setup(t)

  await session.start({ type: 'start', apiKey: 'test', sessionConfig: '{}', sampleRate: 24000 })
  session.receive({ type: 'session.started' })
  const closing = session.stop()

  assert.equal(session.phase, 'closing')
  assert.equal(counts().stopped, 1)
  assert.equal(counts().closed, 0)
  assert.deepEqual(JSON.parse(sent.at(-1)!), { type: 'session.close' })
  session.receive({ type: 'session.output_audio.delta', delta: 'AAAA' })
  assert.deepEqual(played, [], 'no late speech after Stop')
  session.receive({ type: 'session.closed' })
  await closing
  assert.equal(session.phase, 'idle')
  assert.equal(counts().closed, 1)
})

test('protocol errors and unexpected transport closes release resources', async (t) => {
  const { session, socket, counts } = setup(t)

  await session.start({ type: 'start', apiKey: 'test', sessionConfig: '{}', sampleRate: 24000 })
  const receive = socket.onmessage!

  session.receive({ type: 'error', error: { message: 'Unsupported session configuration' } })
  assert.equal(session.phase, 'error')
  assert.equal(counts().stopped, 1)
  receive({ data: '{"type":"session.started"}' })
  assert.equal(session.ready, false, 'old generation cannot attach microphone input')
  await session.start({ type: 'start', apiKey: 'test', sessionConfig: '{}', sampleRate: 24000 })
  socket.onclose!({ code: 1006, reason: '', wasClean: false })
  assert.equal(session.phase, 'error')
  assert.equal(counts().stopped, 2)
})
