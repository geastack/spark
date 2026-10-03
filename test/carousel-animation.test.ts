import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { URL } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import type carouselStore from '../src/stores/CarouselStore.ts'

type CarouselStore = typeof carouselStore

// Exercise the authored modules without starting Gea's DOM or device hosts.
function load<T>(file: string, dependencies: Record<string, object>, globals: object = {}): T {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports = {}

  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`)

      return dependencies[name]
    },
    ...globals,
  })

  return exports as T
}

function carousel(ids: string[]): CarouselStore {
  return load<{ default: CarouselStore }>('../src/stores/CarouselStore.ts', {
    '@geastack/core': { Store: class {} },
    '../components/characters/registry.js': { characterIds: ids },
    '../config/character.js': { initialCharacter: { id: ids[0] } },
  }).default
}

test('one character remains centered and ignores swipes', () => {
  const store = carousel(['kitt'])

  assert.equal(store.pageSlot('kitt'), 0)
  store.pointerDown(200, 100, 1)
  store.pointerMove(50, 100, 1)
  assert.equal(store.pointerUp(1), false)
  assert.equal(store.dragging, false)
  assert.equal(store.offset, 0)
})

for (const dx of [-120, 120]) {
  test(`two characters reveal the neighbor and settle without jumping: drag ${dx}`, () => {
    const store = carousel(['kitt', 'nova'])

    store.pointerDown(200, 100, 1)
    store.pointerMove(200 + dx, 100, 1)
    const neighborBefore = store.pageSlot('nova') + store.offset
    const centerBefore = store.pageSlot('kitt') + store.offset

    assert.equal(store.pageSlot('nova'), dx < 0 ? 410 : -410)
    assert.equal(store.pointerUp(1), true)
    assert.equal(store.id, 'nova')
    assert.equal(store.pageSlot('nova') + store.offset, neighborBefore)
    assert.equal(store.pageSlot('kitt') + store.offset, centerBefore)
    for (let frame = 0; frame < 100; frame++) {
      store.animate(16)
    }

    assert.equal(store.offset, 0)
    store.pointerDown(200, 100, 2)
    store.pointerMove(200 + dx, 100, 2)
    assert.equal(store.pointerUp(2), true)
    assert.equal(store.id, 'kitt')
  })
}

test('three or more characters retain distinct neighbors in both directions', () => {
  const store = carousel(['kitt', 'nova', 'echo', 'flora'])

  assert.equal(store.pageSlot('kitt'), 0)
  assert.equal(store.pageSlot('nova'), 410)
  assert.equal(store.pageSlot('flora'), -410)
})

test('scheduler primes once, dispatches only the selected painter and pauses during swipes', () => {
  const ids = ['kitt', 'echo', 'flora', 'nova']
  const primed: string[] = []
  const painted: string[] = []
  const dependencies: Record<string, object> = {}

  for (const id of ids) {
    dependencies[`./${id}/animation.js`] = {
      prime: () => {
        primed.push(id)

        return true
      },
      paint: () => painted.push(id),
    }
  }

  const scheduler = load<{
    paintCharacters: (elapsed: number, level: number, id: string, advance: boolean) => void
  }>('../src/components/characters/paint.ts', dependencies)

  scheduler.paintCharacters(0.033, 0, 'nova', false)
  assert.deepEqual(primed, ids)
  assert.deepEqual(painted, [])
  scheduler.paintCharacters(0.033, 0.3, 'nova', true)
  scheduler.paintCharacters(0.033, 0.3, 'echo', true)
  scheduler.paintCharacters(0.033, 0.3, 'echo', false)
  assert.deepEqual(primed, ids)
  assert.deepEqual(painted, ['nova', 'echo'])
})

test('Nova caches its Canvas context and does not draw when paused', () => {
  let lookups = 0
  let contexts = 0
  let draws = 0
  const context = { fillRect: () => draws++ }
  const painter = load<{
    prime: () => boolean
    paint: (elapsed: number, level: number, advance: boolean) => void
  }>(
    '../src/components/characters/nova/animation.ts',
    { '../../../animations/drawing.js': { circle: () => {}, ellipse: () => {} } },
    {
      document: {
        getElementById: () => {
          lookups++

          return {
            getContext: () => {
              contexts++

              return context
            },
          }
        },
      },
    },
  )

  assert.equal(painter.prime(), true)
  assert.equal(painter.prime(), true)
  const before = draws

  painter.paint(0.033, 0.4, false)
  assert.equal(draws, before)
  painter.paint(0.033, 0.4, true)
  assert.ok(draws > before)
  assert.equal(lookups, 1)
  assert.equal(contexts, 1)
})
