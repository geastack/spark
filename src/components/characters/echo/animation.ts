import type { CanvasRenderingContext2D, GeaCanvasElement } from '@geastack/core'
import { circle, ellipse, line } from '../../../animations/drawing.js'

function drawEcho(ctx: CanvasRenderingContext2D, time: number, phase: number, level: number): void {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 320, 240)
  ctx.lineWidth = 1
  for (let ring = 1; ring <= 4; ring++) {
    ellipse(ctx, 160, 120, ring * 26, ring * 26, 0, '#173a35')
  }

  line(ctx, 51, 120, 269, 120, '#102a27')
  line(ctx, 160, 11, 160, 229, '#102a27')
  for (let tick = 0; tick < 24; tick++) {
    const a = (tick * Math.PI) / 12

    line(
      ctx,
      160 + Math.cos(a) * 108,
      120 + Math.sin(a) * 108,
      160 + Math.cos(a) * 112,
      120 + Math.sin(a) * 112,
      '#426b60',
    )
  }

  const sweep = phase * Math.PI * 2

  for (let band = 10; band > 0; band--) {
    const a = sweep - band * 0.06

    ctx.globalAlpha = (11 - band) * 0.014
    ctx.fillStyle = '#57d9b6'
    ctx.beginPath()
    ctx.moveTo(160, 120)
    ctx.lineTo(160 + Math.cos(a) * 104, 120 + Math.sin(a) * 104)
    ctx.lineTo(160 + Math.cos(a + 0.06) * 104, 120 + Math.sin(a + 0.06) * 104)
    ctx.closePath()
    ctx.fill()
  }

  ctx.globalAlpha = 0.7
  line(ctx, 160, 120, 160 + Math.cos(sweep) * 104, 120 + Math.sin(sweep) * 104, '#7eefd0')
  for (let blip = 0; blip < 3; blip++) {
    const angle = blip * 2.1 + 0.7
    const radius = 48 + blip * 21
    const age = (sweep - angle + Math.PI * 4) % (Math.PI * 2)
    const brightness = Math.max(0.08, 1 - age / 2.5)
    const x = 160 + Math.cos(angle) * radius
    const y = 120 + Math.sin(angle) * radius

    ctx.globalAlpha = brightness * 0.15
    circle(ctx, x, y, 8, '#92f5d6')
    ctx.globalAlpha = brightness
    circle(ctx, x, y, 3, '#c0ffe9')
  }

  ctx.globalAlpha = 1
  if (level > 0.015) {
    ctx.strokeStyle = '#c5ffec'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let point = 0; point <= 64; point++) {
      const u = point / 64
      const envelope = Math.sin(u * Math.PI)
      const wave = Math.sin(u * 32 + time * 12) * 0.65 + Math.sin(u * 51 - time * 8) * 0.35
      const x = 70 + u * 180
      const y = 120 + wave * envelope * level * 45

      if (point === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  } else {
    circle(ctx, 160, 120, 3, '#c5ffec')
  }
}

let context: CanvasRenderingContext2D | null = null
let time = 0
let phase = 0

export function prime(): boolean {
  if (context) {
    return true
  }

  const canvas = document.getElementById('echo-canvas') as unknown as GeaCanvasElement | null

  if (!canvas) {
    return false
  }

  context = canvas.getContext('2d')
  drawEcho(context, time, phase, 0)

  return true
}

export function paint(elapsed: number, level: number, advance: boolean): void {
  if (!advance || !context) {
    return
  }

  time += elapsed
  phase = (phase + elapsed * (0.22 + level * 0.24)) % 1

  drawEcho(context, time, phase, level)
}
