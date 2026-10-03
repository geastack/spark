import type { CanvasRenderingContext2D, GeaCanvasElement } from '@geastack/core'
import { circle, line } from '../../../animations/drawing.js'

const leafGrowth: number[] = [0.65, 0.65, 0.65, 0.65, 0.3, 0.3, 0, 0]
let lastTime = -1
let budLevel = 0

function leaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  color: string,
): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  // Sample a tapered curved contour; both sides meet at the stem and tip.
  for (let point = 1; point <= 24; point++) {
    const u = point <= 12 ? point / 12 : (24 - point) / 12
    const side = point <= 12 ? 1 : -1
    const along = u * length
    const across = Math.sin(u * Math.PI) * width * side + u * u * width * 0.28

    ctx.lineTo(x + along * c - across * s, y + along * s + across * c)
  }

  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 1
  line(ctx, x, y, x + length * 0.9 * c, y + length * 0.9 * s, '#b9df8b')
  if (length > 24) {
    for (let vein = 1; vein <= 3; vein++) {
      const u = vein / 5
      const along = u * length
      const spread = Math.sin(u * Math.PI) * width * 0.7

      line(
        ctx,
        x + along * c,
        y + along * s,
        x + (along + length * 0.12) * c - spread * s,
        y + (along + length * 0.12) * s + spread * c,
        '#78a65e',
      )
    }
  }
}

function petal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  color: string,
): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let point = 1; point <= 24; point++) {
    const u = point <= 12 ? point / 12 : (24 - point) / 12
    const side = point <= 12 ? 1 : -1
    const along = u * length
    const across = Math.sqrt(Math.max(0, Math.sin(u * Math.PI))) * width * side

    ctx.lineTo(x + along * c - across * s, y + along * s + across * c)
  }

  ctx.closePath()
  ctx.fill()
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  const breath = 1 + Math.sin(time * 0.65) * 0.035 + budLevel * 0.05
  const tilt = Math.sin(time * 0.8) * 0.09

  for (let index = 0; index < 8; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 4 + tilt
    const flutter = Math.sin(time * 0.9 + index * 0.7) * 0.025

    petal(
      ctx,
      x,
      y,
      (25 + Math.sin(time * 0.7 + index) * 0.7) * breath,
      8.5 * breath,
      angle + flutter,
      index % 2 === 0 ? '#efaec0' : '#d98aa8',
    )
  }

  for (let index = 0; index < 8; index++) {
    petal(
      ctx,
      x,
      y,
      16 * breath,
      5.5 * breath,
      -Math.PI / 2 + (index * Math.PI) / 4 + Math.PI / 8 + tilt,
      index % 2 === 0 ? '#ffe5d0' : '#ffd2cc',
    )
  }

  circle(ctx, x, y, 7 * breath, '#c79043')
  circle(ctx, x - 0.8, y - 0.8, 5.5 * breath, '#f4cf77')
  for (let seed = 0; seed < 7; seed++) {
    const angle = (seed * Math.PI * 2) / 7 + tilt

    circle(ctx, x + Math.cos(angle) * 3.5, y + Math.sin(angle) * 3.5, 0.8, '#fff0bb')
  }

  circle(ctx, x, y, 1.3, '#fff6d5')
}

function drawFlora(ctx: CanvasRenderingContext2D, time: number, level: number): void {
  const delta = time - lastTime
  const elapsed = lastTime < 0 || delta < 0 ? 0.033 : Math.min(0.1, delta)

  lastTime = time
  budLevel += (level - budLevel) * (1 - Math.exp(-elapsed / 0.25))
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 320, 240)

  const sway = Math.sin(time * 0.8) * 5

  ctx.strokeStyle = '#809e62'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(160, 216)
  for (let step = 1; step <= 20; step++) {
    const u = step / 20

    ctx.lineTo(160 + sway * u * u + Math.sin(u * Math.PI) * 5, 216 - u * 156)
  }

  ctx.stroke()
  ctx.lineWidth = 1
  for (let index = 0; index < 8; index++) {
    const row = Math.floor(index / 2)
    const side = index % 2 === 0 ? -1 : 1
    const resting = index < 4 ? 0.65 : index < 6 ? 0.3 : 0
    const target = Math.max(resting, Math.min(1, level * 8 - index * 0.65))
    const previous = leafGrowth[index] || 0
    // Unfold gently and settle more slowly between syllables.
    const duration = target > previous ? 0.25 : 0.9
    const growth = previous + (target - previous) * (1 - Math.exp(-elapsed / duration))

    leafGrowth[index] = growth

    if (growth < 0.025) {
      continue
    }

    const u = (40 + row * 30) / 156
    const x = 160 + sway * u * u + Math.sin(u * Math.PI) * 5
    const y = 176 - row * 30
    const flutter = Math.sin(time * 1.3 + index * 0.8) * 0.07
    const angle =
      side < 0 ? -Math.PI + 0.22 + growth * 0.4 + flutter : -0.22 - growth * 0.4 + flutter
    const length = (68 - row * 6) * growth
    const width = (17 - row) * growth

    leaf(ctx, x, y, length, width, angle, index % 2 === 0 ? '#5f9a57' : '#8fbf68')
  }

  flower(ctx, 160 + sway, 60, time)
  ctx.lineWidth = 1
  line(ctx, 115, 217, 205, 217, '#273c29')
  for (let mote = 0; mote < 6; mote++) {
    const x = 65 + mote * 37 + Math.sin(time * 0.5 + mote) * 8
    const y = 205 - ((time * 10 + mote * 33) % 170)

    ctx.globalAlpha = 0.12 + Math.sin(((y - 35) / 170) * Math.PI) * 0.3
    circle(ctx, x, y, 1.4, '#d4e6ad')
  }

  ctx.globalAlpha = 1
}

let context: CanvasRenderingContext2D | null = null
let time = 0

export function prime(): boolean {
  if (context) {
    return true
  }

  const canvas = document.getElementById('flora-canvas') as unknown as GeaCanvasElement | null

  if (!canvas) {
    return false
  }

  context = canvas.getContext('2d')
  drawFlora(context, time, 0)

  return true
}

export function paint(elapsed: number, level: number, advance: boolean): void {
  if (!advance || !context) {
    return
  }

  time += elapsed

  drawFlora(context, time, level)
}
