import { RealtimeSession, type SessionStart } from '../src/services/RealtimeSession.js'

const session = new RealtimeSession((message) => self.postMessage(message))

self.onmessage = async (event) => {
  if (typeof event.data !== 'string') {
    return
  }

  try {
    const options = JSON.parse(event.data) as SessionStart

    options.captureMicrophone = false
    await session.start(options)
    session.character.opening =
      'Tell a gentle nature story, continuously for about one minute, for an audio playback test.'
  } catch (error) {
    session.fail(error instanceof Error ? error.message : 'Silent audio diagnostic failed.')
  }
}

setTimeout(() => {
  session.stop()
  self.close()
}, 120000)
