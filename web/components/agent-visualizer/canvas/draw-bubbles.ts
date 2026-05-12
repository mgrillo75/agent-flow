import { Agent, NODE } from '@/lib/agent-types'
import { COLORS, withAlpha } from '@/lib/colors'
import { BUBBLE_MAX_W, BUBBLE_GAP, BUBBLE_MAX_LINES, AGENT_DRAW, BUBBLE_DRAW } from '@/lib/canvas-constants'
import { bubbleAlpha } from './bubble-utils'
import { measureTextCached } from './render-cache'

/** World-space bubbles attached to agents (used when zoomed in) */
export function drawMessageBubblesWorld(
  ctx: CanvasRenderingContext2D,
  agents: Map<string, Agent>,
  time: number,
) {
  for (const agent of agents.values()) {
    if (agent.messageBubbles.length === 0) continue

    const radius = agent.isMain ? NODE.radiusMain : NODE.radiusSub
    const anchorX = agent.x + radius + AGENT_DRAW.bubbleAnchorOffset
    let cursorY = agent.y + AGENT_DRAW.bubbleCursorY

    let firstVisible = true

    for (const bubble of agent.messageBubbles) {
      const age = time - bubble.time
      const alpha = bubbleAlpha(age, agent.opacity)
      if (alpha < BUBBLE_DRAW.minReadableAlpha) continue

      const { role, text } = bubble

      const isThinking = role === 'thinking'
      const bgColor = isThinking ? COLORS.bubbleThinkingBase : role === 'user' ? COLORS.bubbleUserBase : COLORS.bubbleAssistantBase
      const textColor = isThinking ? COLORS.roleThinkingText : role === 'user' ? COLORS.roleUserText : COLORS.roleAssistantText
      const label = isThinking ? '\uD83D\uDCAD THINKING' : role === 'user' ? 'USER' : 'CODEX'

      // Thinking bubbles stay compact, but remain readable at the top canvas edge.
      const style = isThinking ? BUBBLE_DRAW.thinking : BUBBLE_DRAW.normal
      const fillAlpha = isThinking ? BUBBLE_DRAW.thinkingFillAlpha : BUBBLE_DRAW.fillAlpha
      const strokeAlpha = isThinking ? BUBBLE_DRAW.thinkingStrokeAlpha : BUBBLE_DRAW.strokeAlpha
      const labelAlpha = isThinking ? BUBBLE_DRAW.thinkingLabelAlpha : BUBBLE_DRAW.labelAlpha
      const bodyAlpha = isThinking ? BUBBLE_DRAW.thinkingBodyAlpha : BUBBLE_DRAW.bodyAlpha

      const font = `${style.fontSize}px monospace`
      ctx.font = font
      // Cache wrapped lines on the bubble to avoid re-wrapping every frame
      let allLines: string[]
      if (bubble._cachedWrappedLines && bubble._cachedWrappedFont === font) {
        allLines = bubble._cachedWrappedLines
      } else {
        allLines = wrapText(ctx, text, BUBBLE_MAX_W - style.padding * 2 - 4)
        bubble._cachedWrappedLines = allLines
        bubble._cachedWrappedFont = font
      }
      const truncated = allLines.length > BUBBLE_MAX_LINES
      const lines = truncated ? allLines.slice(0, BUBBLE_MAX_LINES) : allLines

      const bubbleW = Math.min(BUBBLE_MAX_W, Math.max(...lines.map(l => measureTextCached(ctx, l))) + style.padding * 2 + 4)
      const bubbleH = style.headerH + lines.length * style.lineH + style.padding + (truncated ? style.lineH * 0.8 : 0)

      // Cache dimensions so hit-detection can use exact same values
      bubble._cachedW = bubbleW
      bubble._cachedH = bubbleH
      bubble._cachedLines = lines.length

      ctx.save()
      ctx.globalAlpha = alpha

      if (firstVisible) {
        const triY = cursorY + bubbleH / 2
        ctx.beginPath()
        ctx.moveTo(anchorX, triY - BUBBLE_DRAW.triOffset)
        ctx.lineTo(anchorX - BUBBLE_DRAW.triWidth, triY)
        ctx.lineTo(anchorX, triY + BUBBLE_DRAW.triOffset)
        ctx.fillStyle = withAlpha(bgColor, fillAlpha)
        ctx.fill()
        firstVisible = false
      }

      ctx.beginPath()
      ctx.roundRect(anchorX, cursorY, bubbleW, bubbleH, BUBBLE_DRAW.borderRadius)
      ctx.fillStyle = withAlpha(bgColor, fillAlpha)
      ctx.fill()
      ctx.strokeStyle = withAlpha(bgColor, strokeAlpha)
      ctx.lineWidth = 0.75
      ctx.stroke()

      ctx.shadowColor = BUBBLE_DRAW.textShadowColor
      ctx.shadowBlur = BUBBLE_DRAW.textShadowBlur
      ctx.shadowOffsetY = 1

      ctx.font = `${style.labelSize}px monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = textColor + labelAlpha
      ctx.fillText(label, anchorX + style.padding, cursorY + 3)

      ctx.font = `italic ${style.fontSize}px monospace`
      ctx.fillStyle = textColor + bodyAlpha
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], anchorX + style.padding, cursorY + style.headerH + i * style.lineH)
      }
      if (truncated) {
        ctx.fillStyle = textColor + labelAlpha
        ctx.fillText('...', anchorX + style.padding, cursorY + style.headerH + lines.length * style.lineH)
      }

      ctx.restore()

      cursorY += bubbleH + BUBBLE_GAP
    }
  }
}

/** Word-wrap text into lines that fit within maxW pixels, preserving newlines.
 *  Force-breaks long unbroken tokens (paths, URLs) that exceed maxW. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  // Split on explicit newlines first to preserve line breaks
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('') // preserve blank lines
      continue
    }
    // Word-wrap within each paragraph, preserving leading whitespace
    const leadingMatch = para.match(/^(\s*)/)
    const leading = leadingMatch ? leadingMatch[1] : ''
    const words = para.trimStart().split(/\s+/)
    let currentLine = leading
    for (const word of words) {
      const test = currentLine.trimStart() ? `${currentLine} ${word}` : `${currentLine}${word}`
      if (measureTextCached(ctx, test) > maxW && currentLine.trimStart()) {
        lines.push(currentLine)
        currentLine = leading + word
      } else {
        currentLine = test
      }
      // Force-break if a single token still exceeds maxW
      while (measureTextCached(ctx, currentLine) > maxW && currentLine.length > 1) {
        let breakAt = currentLine.length - 1
        while (breakAt > 1 && measureTextCached(ctx, currentLine.slice(0, breakAt)) > maxW) { breakAt-- }
        lines.push(currentLine.slice(0, breakAt))
        currentLine = leading + currentLine.slice(breakAt)
      }
    }
    if (currentLine) lines.push(currentLine)
  }
  return lines.length > 0 ? lines : ['']
}
