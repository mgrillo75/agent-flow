import {
  type Agent,
  type TimelineEntry,
  emptyContextBreakdown,
} from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { AGENT_SPAWN_DISTANCE } from '@/lib/canvas-constants'
import { pushTimelineBlock, type ProcessEventContext, type MutableEventState } from './process-event'
import { edgeId, asString, asBoolean } from './types'

export function handleAgentSpawn(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const agentId = asString(payload.agent_id, name)
  if (!agentId) return
  const parentName = asString(payload.parent)
  const parentId = asString(payload.parent_id, parentName) || undefined
  const isMain = asBoolean(payload.isMain)
  const task = typeof payload.task === 'string' ? payload.task : undefined
  const model = typeof payload.model === 'string' ? payload.model : undefined
  const runtime = payload.runtime === 'claude' ? 'claude' as const : 'codex' as const

  // If the agent already exists (e.g. session resuming after inactivity),
  // reactivate it instead of replacing — preserves accumulated stats.
  const existing = state.agents.get(agentId)
  if (existing) {
    state.agents.set(agentId, {
      ...existing,
      state: 'idle',
      ...(task ? { task } : {}),
      ...(model ? { tokensMax: ctx.getContextWindowSize(model) } : {}),
    })
    return
  }

  let x = 0, y = 0
  if (parentId) {
    const parent = state.agents.get(parentId)
    if (parent) {
      // Collect angles of existing siblings so we can avoid spawning too close
      const siblingAngles: number[] = []
      for (const a of state.agents.values()) {
        if (a.parentId === parentId && a.id !== agentId) {
          siblingAngles.push(Math.atan2(a.y - parent.y, a.x - parent.x))
        }
      }

      let angle: number
      if (siblingAngles.length === 0) {
        // First child: use hash-based angle
        const hash = agentId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
        angle = (Math.abs(hash) % 360) * (Math.PI / 180)
      } else {
        // Find the largest angular gap between existing siblings and place in the middle
        siblingAngles.sort((a, b) => a - b)
        let bestGap = 0
        let bestMid = 0
        for (let i = 0; i < siblingAngles.length; i++) {
          const next = i + 1 < siblingAngles.length ? siblingAngles[i + 1] : siblingAngles[0] + Math.PI * 2
          const gap = next - siblingAngles[i]
          if (gap > bestGap) {
            bestGap = gap
            bestMid = siblingAngles[i] + gap / 2
          }
        }
        angle = bestMid
      }

      x = parent.x + Math.cos(angle) * AGENT_SPAWN_DISTANCE
      y = parent.y + Math.sin(angle) * AGENT_SPAWN_DISTANCE
    }
  }

  const agent: Agent = {
    id: agentId, name: name || agentId, state: 'idle',
    parentId: parentId || null,
    tokensUsed: 0, tokensMax: ctx.getContextWindowSize(model),
    contextBreakdown: emptyContextBreakdown(),
    toolCalls: 0, timeAlive: 0,
    x, y, vx: 0, vy: 0,
    pinned: false, isMain,
    ...(runtime ? { runtime } : {}),
    task,
    spawnTime: currentTime,
    opacity: 0, scale: 0.3,
    messageBubbles: [],
  }
  state.agents.set(agentId, agent)

  if (parentId) {
    state.edges.push({ id: edgeId(parentId, agentId), from: parentId, to: agentId, type: 'parent-child', opacity: 0 })
  }

  const timelineEntry: TimelineEntry = {
    id: `timeline-${agentId}`,
    agentId,
    agentName: name || agentId,
    startTime: currentTime,
    blocks: [],
  }
  pushTimelineBlock(timelineEntry, currentTime, { type: 'idle', label: 'Starting', color: COLORS.idle }, ctx)
  state.timelineEntries.set(agentId, timelineEntry)

  state.conversations.set(agentId, [])

  if (!ctx.skipForceSync) {
    setTimeout(() => ctx.syncForceSimulation(state.agents, state.edges), 0)
  }
}

export function handleAgentComplete(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const id = asString(payload.agent_id, name)
  const agentKey = state.agents.has(id) ? id : (state.agents.has(name) ? name : '')
  if (!agentKey) return

  const agent = state.agents.get(agentKey)
  if (agent && agent.state !== 'complete') {
    state.agents.set(agentKey, { ...agent, state: 'complete', completeTime: currentTime })

    const entry = state.timelineEntries.get(agentKey)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
      entry.endTime = currentTime
    }

    const agentsToComplete = [agentKey]
    // Only force-complete children on an explicit session end signal.
    if (asBoolean(payload.sessionEnd)) {
      for (const [childId, childAgent] of state.agents) {
        if (childAgent.parentId === agentKey && childAgent.state !== 'complete') {
          state.agents.set(childId, { ...childAgent, state: 'complete', completeTime: currentTime })
          agentsToComplete.push(childId)
          const childEntry = state.timelineEntries.get(childId)
          if (childEntry) {
            pushTimelineBlock(childEntry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
            childEntry.endTime = currentTime
          }
        }
      }
    }

    for (const [tcId, tc] of state.toolCalls) {
      if (agentsToComplete.includes(tc.agentId) && tc.state === 'running') {
        state.toolCalls.set(tcId, { ...tc, state: 'complete', completeTime: currentTime })
      }
    }
  }
}

export function handlePermissionRequested(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const fallbackName = asString(payload.agent, 'orchestrator')
  const agentKey = asString(payload.agent_id, fallbackName)
  const resolvedAgentKey = state.agents.has(agentKey) ? agentKey : (state.agents.has(fallbackName) ? fallbackName : '')
  if (!resolvedAgentKey) return
  const agent = state.agents.get(resolvedAgentKey)
  if (agent && agent.state !== 'complete') {
    state.agents.set(resolvedAgentKey, {
      ...agent,
      state: 'waiting_permission',
    })

    const entry = state.timelineEntries.get(resolvedAgentKey)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'idle', label: 'Permission', color: COLORS.waiting_permission }, ctx)
    }
  }
}

export function handleAgentIdle(
  payload: Record<string, unknown>,
  state: MutableEventState,
): void {
  const idleName = asString(payload.name)
  const idleKey = asString(payload.agent_id, idleName)
  const resolvedIdleKey = state.agents.has(idleKey) ? idleKey : (state.agents.has(idleName) ? idleName : '')
  if (!resolvedIdleKey) return
  const idleAgent = state.agents.get(resolvedIdleKey)
  if (idleAgent && (idleAgent.state === 'tool_calling' || idleAgent.state === 'waiting_permission')) {
    state.agents.set(resolvedIdleKey, { ...idleAgent, state: 'thinking', currentTool: undefined })
  }
}

export function handleModelDetected(
  payload: Record<string, unknown>,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const agentName = asString(payload.agent)
  const agentKey = asString(payload.agent_id, agentName)
  const resolvedAgentKey = state.agents.has(agentKey) ? agentKey : (state.agents.has(agentName) ? agentName : '')
  if (!resolvedAgentKey) return
  const model = asString(payload.model)
  const agent = state.agents.get(resolvedAgentKey)
  if (agent) {
    state.agents.set(resolvedAgentKey, {
      ...agent,
      tokensMax: ctx.getContextWindowSize(model),
    })
  }
}
