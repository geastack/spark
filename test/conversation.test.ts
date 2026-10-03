import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { MessageEvent, WorkerErrorEvent } from '@geastack/core'
import { selectCharacter } from '../src/config/character.ts'
import { createSessionConfig } from '../src/config/session.ts'
import { Conversation } from '../src/services/Conversation.ts'

function setup(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  const workers: TestWorker[] = []

  class TestWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: WorkerErrorEvent) => void) | null = null
    sent: string[] = []
    terminated = false

    constructor() {
      workers.push(this)
    }

    postMessage(data: string): void {
      this.sent.push(data)
    }

    terminate(): void {
      this.terminated = true
    }

    state(phase: string): void {
      this.onmessage?.({ data: JSON.stringify({ type: 'state', phase }), ports: [] })
    }
  }

  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: TestWorker,
  })
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'Worker', descriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'Worker')
    }
  })

  return { conversation: new Conversation(() => {}), workers }
}

test('UI starts only a control worker and Stop waits for owner cleanup acknowledgement', async (t) => {
  const { conversation, workers } = setup(t)

  await conversation.start('key', '{}')
  assert.equal(workers.length, 1)
  assert.equal((JSON.parse(workers[0]!.sent[0]!) as { sampleRate: number }).sampleRate, 24000)
  await conversation.stop()
  assert.equal(conversation.phase, 'closing')
  assert.equal(workers[0]!.terminated, false)
  workers[0]!.state('speaking')
  assert.equal(conversation.phase, 'closing', 'queued speaking must not overwrite Stop')
  workers[0]!.state('idle')
  assert.equal(conversation.phase, 'idle')
  assert.equal(workers[0]!.terminated, true)
  workers[0]!.state('speaking')
  assert.equal(conversation.phase, 'idle', 'late callbacks cannot revive a stopped session')
})

test('worker failure requests owner cleanup before another Start and preserves the error', async (t) => {
  const { conversation, workers } = setup(t)

  await conversation.start('key', '{}')
  workers[0]!.onerror?.({ message: 'Connection failed' })
  assert.equal(conversation.phase, 'error')
  assert.deepEqual(JSON.parse(workers[0]!.sent.at(-1)!), { type: 'stop' })
  await conversation.start('key', '{}')
  assert.equal(workers.length, 1)
  workers[0]!.state('idle')
  assert.equal(conversation.phase, 'error')
  assert.equal(workers[0]!.terminated, true)
  await conversation.start('key', '{}')
  assert.equal(workers.length, 2)
})

test('switching characters creates a fresh worker with matching voice and persona', async (t) => {
  const { conversation, workers } = setup(t)

  await conversation.start('key', createSessionConfig(selectCharacter('nova')), 'nova')
  const first = JSON.parse(workers[0]!.sent[0]!) as { characterId: string; sessionConfig: string }
  const nova = JSON.parse(first.sessionConfig) as {
    instructions: string
    audio: { output: { voice: string } }
  }

  assert.equal(first.characterId, 'nova')
  assert.equal(nova.audio.output.voice, 'marin')
  assert.match(nova.instructions, /You are Nova/)
  await conversation.stop()
  await conversation.start('key', createSessionConfig(selectCharacter('echo')), 'echo')
  assert.equal(workers.length, 1, 'cannot start another voice before old owner closes')
  workers[0]!.state('idle')
  await conversation.start('key', createSessionConfig(selectCharacter('echo')), 'echo')
  const second = JSON.parse(workers[1]!.sent[0]!) as { characterId: string; sessionConfig: string }
  const echo = JSON.parse(second.sessionConfig) as {
    instructions: string
    audio: { output: { voice: string } }
  }

  assert.equal(second.characterId, 'echo')
  assert.equal(echo.audio.output.voice, 'ash')
  assert.match(echo.instructions, /You are Echo/)
})
