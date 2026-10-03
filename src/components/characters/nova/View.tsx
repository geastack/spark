import { Component } from '@geastack/core'
import agent from '../../../stores/AgentStore.js'

export default class Nova extends Component {
  template(): JSX.Element {
    return (
      <div class="character nova">
        <div class="title">NOVA</div>
        <div class={agent.notice ? 'instrument compact' : 'instrument'}>
          <canvas id="nova-canvas" class="character-canvas" width={320} height={240} />
        </div>
      </div>
    )
  }
}
