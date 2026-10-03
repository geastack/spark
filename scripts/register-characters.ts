import { readdir, readFile, access, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import ejs from 'ejs'

const root = new URL('../src/components/characters/', import.meta.url)
const entries = await readdir(root, { withFileTypes: true })
const ids = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => (a === 'kitt' ? -1 : b === 'kitt' ? 1 : a.localeCompare(b)))

for (const id of ids) {
  if (!/^[a-z][a-z0-9]*$/.test(id)) {
    throw new Error(`Character folder must use a lowercase identifier: ${id}`)
  }

  for (const file of ['character.ts', 'View.tsx', 'styles.css']) {
    await access(new URL(`${id}/${file}`, root))
  }
}

const animated: string[] = []

for (const id of ids) {
  try {
    await access(new URL(`${id}/animation.ts`, root))
    animated.push(id)
  } catch {
    // DOM-only characters do not need a Canvas painter.
  }
}

const characters = ids.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }))
const data = {
  characters,
  animated: characters.filter((character) => animated.includes(character.id)),
}
const templates = new URL('./templates/', import.meta.url)

for (const file of ['registry.ts', 'CharacterView.tsx', 'paint.ts']) {
  const template = new URL(`${file}.ejs`, templates)
  const source = await ejs.renderFile(fileURLToPath(template), data)
  const destination = new URL(file, root)
  const formatted = await format(source, {
    ...(await resolveConfig(fileURLToPath(destination))),
    filepath: fileURLToPath(destination),
  })
  const previous = await readFile(destination, 'utf8').catch(() => '')

  if (previous !== formatted) {
    await writeFile(destination, formatted)
  }
}
