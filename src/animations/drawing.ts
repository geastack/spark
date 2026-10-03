import type { CanvasRenderingContext2D } from '@geastack/core'

export function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tilt: number,
  color: string,
): void {
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)

  ctx.strokeStyle = color
  ctx.beginPath()
  for (let point = 0; point <= 64; point++) {
    const angle = (point * Math.PI) / 32
    const px = Math.cos(angle) * rx
    const py = Math.sin(angle) * ry
    const dx = x + px * c - py * s
    const dy = y + px * s + py * c

    if (point === 0) {
      ctx.moveTo(dx, dy)
    } else {
      ctx.lineTo(dx, dy)
    }
  }

  ctx.stroke()
}

export function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
