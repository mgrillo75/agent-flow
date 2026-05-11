import { COLORS } from '@/lib/colors'
import type { MutableEventState } from './process-event'
import { edgeId, asString, LABEL_LEN_SHORT } from './types'

export function handleSubagentDispatch(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
): void {
  const parentName = asString(payload.parent)
  const childName = asString(payload.child)
  const parentId = asString(payload.parent_id, parentName)
  const childId = asString(payload.child_id, asString(payload.agent_id, childName))
  const eid = edgeId(parentId, childId)
  const task = asString(payload.task)

  state.particles.push({
    id: `p-disp-${currentTime}-${eid}`,
    edgeId: eid, progress: 0,
    type: 'dispatch', color: COLORS.dispatch,
    size: 6, trailLength: 0.2,
    label: task.slice(0, LABEL_LEN_SHORT),
  })
}

export function handleSubagentReturn(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
): void {
  const parentName = asString(payload.parent)
  const childName = asString(payload.child)
  const parentId = asString(payload.parent_id, parentName)
  const childId = asString(payload.child_id, asString(payload.agent_id, childName))
  const eid = edgeId(parentId, childId)
  const summary = asString(payload.summary)

  state.particles.push({
    id: `p-ret-${currentTime}-${eid}`,
    edgeId: eid, progress: 1,
    type: 'return', color: COLORS.return,
    size: 5, trailLength: 0.2,
    label: summary.slice(0, LABEL_LEN_SHORT),
  })
}
