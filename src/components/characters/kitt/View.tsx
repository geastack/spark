import { Component } from '@geastack/core'
import kitt from './Store.js'
import agent from '../../../stores/AgentStore.js'

export default class Kitt extends Component {
  template(): JSX.Element {
    return (
      <div class="character kitt">
        <div class="title">KITT</div>
        <div class={agent.notice ? 'instrument compact' : 'instrument'}>
          <div class="voicebox" style={{ display: agent.speaking ? 'flex' : 'none' }}>
            <div class="voice-column">
              {kitt.sideSegments.map((segment) => (
                <img
                  src="src/components/characters/kitt/assets/voice-lamp.png"
                  key={segment}
                  class="voice-segment"
                  style={{ opacity: kitt.voiceGlow(segment, 0.62) }}
                />
              ))}
            </div>
            <div class="voice-column center-column">
              {kitt.segments.map((segment) => (
                <img
                  src="src/components/characters/kitt/assets/voice-lamp.png"
                  key={segment}
                  class="voice-segment"
                  style={{ opacity: kitt.voiceGlow(segment, 1) }}
                />
              ))}
            </div>
            <div class="voice-column">
              {kitt.sideSegments.map((segment) => (
                <img
                  src="src/components/characters/kitt/assets/voice-lamp.png"
                  key={segment}
                  class="voice-segment"
                  style={{ opacity: kitt.voiceGlow(segment, 0.62) }}
                />
              ))}
            </div>
          </div>
          <div class="scanner" style={{ display: agent.speaking ? 'none' : 'flex' }}>
            {kitt.cells.map((cell) => (
              <div key={cell} class="cell" style={{ opacity: kitt.glow(cell) }} />
            ))}
          </div>
        </div>
      </div>
    )
  }
}
