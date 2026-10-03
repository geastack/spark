import type { CanvasRenderingContext2D, GeaCanvasElement } from '@geastack/core'
import { circle, ellipse } from '../../../animations/drawing.js'

const starOffsetX: number[] = [0, 0, 0, 0, 0]
const starOffsetY: number[] = [0, 0, 0, 0, 0]
let lastTime = -1
let twinklePhase = 0
let twinkleEnergy = 0

function drawNova(ctx: CanvasRenderingContext2D, time: number, phase: number, level: number): void {
  const delta = time - lastTime
  const elapsed = lastTime < 0 || delta < 0 ? 0.033 : Math.min(0.1, delta)

  lastTime = time
  const targetEnergy = Math.min(1, level * 2)

  twinkleEnergy += (targetEnergy - twinkleEnergy) * (1 - Math.exp(-elapsed / 0.15))
  // Integrate the rate so louder syllables accelerate sparkle without jumps.
  twinklePhase = (twinklePhase + elapsed * (0.8 + twinkleEnergy * 6)) % (Math.PI * 40)
  for (let layer = 0; layer < 5; layer++) {
    const depth = 0.35 + layer * 0.22

    starOffsetX[layer] = ((starOffsetX[layer] || 0) + elapsed * depth * 2.8) % 316
    starOffsetY[layer] = ((starOffsetY[layer] || 0) + elapsed * depth) % 236
  }

  ctx.globalAlpha = 1
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 320, 240)

  for (let star = 0; star < 76; star++) {
    const layer = star % 5
    const x = ((star * 73 + (starOffsetX[layer] || 0)) % 316) + 2
    const y = ((star * 47 + (starOffsetY[layer] || 0)) % 236) + 2

    const wave = (Math.sin(twinklePhase * (1 + layer * 0.05) + star * 2.3) + 1) / 2
    const sparkle = wave * wave * wave

    ctx.globalAlpha = 0.25 - twinkleEnergy * 0.15 + wave * (0.5 + twinkleEnergy * 0.4)
    ctx.fillStyle = star % 3 === 0 ? '#e1d9ff' : '#b9b5e9'
    const size = star % 7 === 0 ? 2 : 1

    ctx.fillRect(x, y, size, size)
    if (star % 6 === 0 && twinkleEnergy > 0.1) {
      ctx.globalAlpha = sparkle * twinkleEnergy * 0.65
      ctx.fillStyle = '#fff6ff'
      ctx.fillRect(x - 2, y, size + 4, 1)
      ctx.fillRect(x, y - 2, 1, size + 4)
    }
  }

  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ellipse(ctx, 160, 120, 66, 34, -0.3, '#242039')
  ellipse(ctx, 160, 120, 108, 58, 0.28, '#29233e')
  ellipse(ctx, 160, 120, 145, 85, -0.18, '#252139')

  // Layered discs give the central star a soft corona without a shader or
  // full-canvas gradient. Its energy follows the speaker, not a timer.
  circle(ctx, 160, 120, 32 + level * 14, '#100d20')
  circle(ctx, 160, 120, 26 + level * 9, '#201832')
  circle(ctx, 160, 120, 21 + level * 5, '#42305c')
  circle(ctx, 160, 120, 16 + level * 2, '#bb92e2')
  circle(ctx, 156, 116, 11, '#eee0ff')
  circle(ctx, 153, 113, 4, '#fff8ed')

  for (let planet = 0; planet < 3; planet++) {
    const rx = planet === 0 ? 66 : planet === 1 ? 108 : 145
    const ry = planet === 0 ? 34 : planet === 1 ? 58 : 85
    const tilt = planet === 0 ? -0.3 : planet === 1 ? 0.28 : -0.18
    const speed = planet === 0 ? 1.7 : planet === 1 ? -1 : 0.65
    const angle = phase * speed + planet * 2.1
    const c = Math.cos(tilt)
    const s = Math.sin(tilt)
    const color = planet === 0 ? '#efb77d' : planet === 1 ? '#83d9de' : '#b59ce9'
    const radius = planet === 0 ? 5 : planet === 1 ? 8 : 10

    for (let trail = 12; trail > 0; trail--) {
      const a = angle - trail * 0.045 * (speed > 0 ? 1 : -1)
      const px = Math.cos(a) * rx
      const py = Math.sin(a) * ry

      ctx.globalAlpha = (1 - trail / 13) * 0.28
      circle(ctx, 160 + px * c - py * s, 120 + px * s + py * c, 2, color)
    }

    const px = Math.cos(angle) * rx
    const py = Math.sin(angle) * ry
    const x = 160 + px * c - py * s
    const y = 120 + px * s + py * c

    ctx.globalAlpha = 0.16
    circle(ctx, x, y, radius + 5, color)
    ctx.globalAlpha = 1
    circle(ctx, x, y, radius, color)
    circle(
      ctx,
      x + radius * 0.25,
      y + radius * 0.25,
      radius * 0.68,
      planet === 1 ? '#397f9f' : '#78639a',
    )
    circle(ctx, x - radius * 0.32, y - radius * 0.32, radius * 0.25, '#fff0dc')
    if (planet === 2) {
      ellipse(ctx, x, y, 18, 5, -0.3, '#d0b5ee')
    }
  }

  ctx.globalAlpha = 1
}

let context: CanvasRenderingContext2D | null = null
let time = 0
let phase = 0

export function prime(): boolean {
  if (context) {
    return true
  }

  const canvas = document.getElementById('nova-canvas') as unknown as GeaCanvasElement | null

  if (!canvas) {
    return false
  }

  context = canvas.getContext('2d')
  drawNova(context, time, phase, 0)

  return true
}

export function paint(elapsed: number, level: number, advance: boolean): void {
  if (!advance || !context) {
    return
  }

  time += elapsed
  phase = (phase + elapsed * (0.55 + level * 4.2)) % (Math.PI * 40)

  drawNova(context, time, phase, level)
}
