import type { SessionStart } from '../services/RealtimeSession.js'
import { LiveSession } from '../services/LiveSession.js'

const session = new LiveSession((message) => self.postMessage(message))

self.onmessage = async (event) => {
  if (typeof event.data !== 'string') {
    return
  }

  try {
    const command = JSON.parse(event.data) as { type: string }

    if (command.type === 'start') {
      await session.start(JSON.parse(event.data) as SessionStart)
    } else if (command.type === 'stop') {
      await session.stop()
      self.close()
    }
  } catch (error) {
    session.fail(error instanceof Error ? error.message : 'Conversation worker failed.')
  }
}
