import { Component } from '@geastack/core'
import agent from '../../../stores/AgentStore.js'

export default class Flora extends Component {
  template(): JSX.Element {
    return (
      <div class="character flora">
        <div class="title">FLORA</div>
        <div class={agent.notice ? 'instrument compact' : 'instrument'}>
          <canvas id="flora-canvas" class="character-canvas" width={320} height={240} />
        </div>
      </div>
    )
  }
}
