import { Component } from '@geastack/core'
import agent from '../stores/AgentStore.js'
import carousel from '../stores/CarouselStore.js'
import CharacterView from './characters/CharacterView.js'

export default class App extends Component {
  release(pointer: number): void {
    if (carousel.pointerUp(pointer)) {
      agent.characterChanged()
    }
  }

  template(): JSX.Element {
    return (
      <div class={`console theme-${carousel.id}`}>
        <div
          class={agent.notice ? 'carousel compact-carousel' : 'carousel'}
          onPointerDown={(event) =>
            carousel.pointerDown(event.clientX, event.clientY, event.pointerId)
          }
          onPointerMove={(event) =>
            carousel.pointerMove(event.clientX, event.clientY, event.pointerId)
          }
          onPointerUp={(event) => this.release(event.pointerId)}
        >
          <div class="carousel-track" style={{ left: carousel.offset }}>
            {carousel.ids.map((id) => (
              <div key={id} class="character-panel" style={{ left: carousel.pageSlot(id) }}>
                <CharacterView id={id} />
              </div>
            ))}
          </div>
        </div>
        <div class={agent.notice ? 'readout expanded' : 'readout'}>
          <div class="message">{agent.notice}</div>
        </div>
        <button class="connect" disabled={agent.phase === 'closing'} onClick={() => agent.toggle()}>
          {agent.phase === 'closing' ? 'Stopping...' : agent.active ? 'Stop' : 'Start'}
        </button>
      </div>
    )
  }
}
