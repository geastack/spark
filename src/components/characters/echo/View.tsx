import { Component } from '@geastack/core'
import agent from '../../../stores/AgentStore.js'

export default class Echo extends Component {
  template(): JSX.Element {
    return (
      <div class="character echo">
        <div class="title">ECHO</div>
        <div class={agent.notice ? 'instrument compact' : 'instrument'}>
          <canvas id="echo-canvas" class="character-canvas" width={320} height={240} />
        </div>
      </div>
    )
  }
}
