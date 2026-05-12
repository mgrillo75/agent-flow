"use client"

import { memo } from "react"
import { Z } from "@/lib/agent-types"
import { COLORS } from "@/lib/colors"
import { formatTokens } from "@/lib/utils"
import { agentCost } from "./canvas/draw-cost"
import type { SessionInfo, ConnectionStatus } from "@/lib/bridge-types"

// ─── Mute/Unmute SVG Icons ───────────────────────────────────────────────────

function MutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

function UnmutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  )
}

// ─── Toggle Button ──────────────────────────────────────────────────────────

function ToggleButton({ active, onClick, children, style, activeColor }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
  activeColor?: { bg: string; text: string }
}) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded transition-all"
      style={{
        background: active ? (activeColor?.bg ?? COLORS.toggleActive) : COLORS.toggleInactive,
        border: `1px solid ${COLORS.toggleBorder}`,
        color: active ? (activeColor?.text ?? COLORS.holoBright) : COLORS.textMuted,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Connection Status Indicator ────────────────────────────────────────────

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const color = status === 'watching' ? COLORS.complete
    : status === 'connected' ? COLORS.idle : COLORS.error
  const label = status === 'watching' ? 'LIVE'
    : status === 'connected' ? 'CONNECTED' : 'OFFLINE'

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
      />
      {label}
    </span>
  )
}

// ─── Top Bar ────────────────────────────────────────────────────────────────

export interface TopBarProps {
  // Session tabs
  sessions: SessionInfo[]
  selectedSessionId: string | null
  sessionsWithActivity: Set<string>
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  // Connection
  isVSCode: boolean
  connectionStatus: ConnectionStatus
  // Stats
  agentCount: number
  totalTokens: number
  // Panel toggles
  showFileAttention: boolean
  showTranscript: boolean
  showCostOverlay: boolean
  showTimeline: boolean
  isMuted: boolean
  onTogglePanel: (panel: 'files' | 'transcript' | 'cost') => void
  onToggleTimeline: () => void
  onToggleMute: () => void
}

function sortByRecency(a: SessionInfo, b: SessionInfo): number {
  return b.lastActivityTime - a.lastActivityTime
}

export const TopBar = memo(function TopBar({
  sessions, selectedSessionId, sessionsWithActivity,
  onSelectSession, onCloseSession,
  isVSCode, connectionStatus,
  agentCount, totalTokens,
  showFileAttention, showTranscript, showCostOverlay, showTimeline, isMuted,
  onTogglePanel, onToggleTimeline, onToggleMute,
}: TopBarProps) {
  const activeSessions = sessions
    .filter(session => session.status === 'active')
    .sort(sortByRecency)

  const selectedSession = selectedSessionId
    ? sessions.find(session => session.id === selectedSessionId) || null
    : null

  // Keep only the current live session in the top strip.
  const liveSession = selectedSession?.status === 'active'
    ? selectedSession
    : activeSessions[0] || selectedSession || sessions[0] || null

  const historicalSessions = sessions
    .filter(session => session.id !== liveSession?.id)
    .sort(sortByRecency)

  const isViewingLive = !!liveSession && selectedSessionId === liveSession.id

  return (
    <>
      <div className="absolute top-3 left-3 right-3 flex items-start gap-4 font-mono text-[10px]" style={{ zIndex: Z.info }}>
        {/* Live session strip */}
        {liveSession && (
          <div
            className="min-w-0 max-w-[42vw] rounded px-2 py-1"
            style={{
              background: COLORS.glassBg,
              border: `1px solid ${COLORS.glassBorder}`,
              boxShadow: `0 0 8px ${COLORS.holoBg10}`,
            }}
          >
            <div className="mb-0.5 text-[8px] tracking-wide uppercase" style={{ color: COLORS.textMuted }}>
              Live Session
            </div>
            <button
              onClick={() => onSelectSession(liveSession.id)}
              className="w-full flex items-center gap-1.5 rounded px-1 py-0.5 text-left"
              style={{
                background: COLORS.tabSelectedBg,
                border: `1px solid ${COLORS.tabSelectedBorder}`,
                color: COLORS.holoBright,
              }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: COLORS.complete,
                  boxShadow: `0 0 4px ${COLORS.complete}`,
                }}
              />
              <span className="truncate">{liveSession.label}</span>
            </button>
            {!isViewingLive && (
              <div className="mt-0.5 text-[8px] truncate" style={{ color: COLORS.textMuted }}>
                Viewing historical session
              </div>
            )}
          </div>
        )}

        {/* Spacer pushes info to the right */}
        <div className="flex-1" />

        {/* Right-side info/controls */}
        <div className="flex items-center gap-4 flex-shrink-0" style={{ color: COLORS.textMuted }}>
          {isVSCode && <ConnectionIndicator status={connectionStatus} />}
          <span>{agentCount} agents</span>
          <span>
            {formatTokens(totalTokens)} tokens
            <span style={{ color: COLORS.complete + '65', marginLeft: 4 }}>
              ~${agentCost(totalTokens).toFixed(2)}
            </span>
          </span>

          {/* Mutually exclusive panel group */}
          <div className="flex items-center gap-1 px-1 py-0.5 rounded" style={{
            background: COLORS.holoBg03,
            border: `1px solid ${COLORS.holoBorder06}`,
          }}>
            <ToggleButton active={showFileAttention} onClick={() => onTogglePanel('files')} style={{ background: showFileAttention ? undefined : 'transparent', border: 'none' }}>Files</ToggleButton>
            <ToggleButton active={showTranscript} onClick={() => onTogglePanel('transcript')} style={{ background: showTranscript ? undefined : 'transparent', border: 'none' }}>Chat</ToggleButton>
            <ToggleButton
              active={showCostOverlay}
              onClick={() => onTogglePanel('cost')}
              activeColor={{ bg: COLORS.costActiveBg, text: COLORS.complete }}
              style={{ background: showCostOverlay ? undefined : 'transparent', border: 'none' }}
            >
              $Cost
            </ToggleButton>
          </div>

          {/* Independent toggles */}
          <ToggleButton active={showTimeline} onClick={onToggleTimeline}>Timeline</ToggleButton>
          <ToggleButton active={!isMuted} onClick={onToggleMute} style={{ border: `1px solid ${COLORS.toggleBorder}` }}>
            {isMuted ? <MutedIcon /> : <UnmutedIcon />}
          </ToggleButton>
        </div>
      </div>

      {/* Historical sessions card — compact rows on the side */}
      {historicalSessions.length > 0 && (
        <div className="absolute top-14 right-3 font-mono text-[10px]" style={{ zIndex: Z.info }}>
          <div
            className="rounded px-2 py-1.5"
            style={{
              width: 'min(260px, 30vw)',
              minWidth: 170,
              background: COLORS.glassBg,
              border: `1px solid ${COLORS.glassBorder}`,
              boxShadow: `0 0 12px ${COLORS.holoBg10}`,
            }}
          >
            <div className="mb-1 flex items-center justify-between text-[8px] uppercase tracking-wide" style={{ color: COLORS.textMuted }}>
              <span>Session History</span>
              <span>{historicalSessions.length}</span>
            </div>
            <div className="max-h-44 overflow-y-auto pr-1 space-y-1">
              {historicalSessions.map((session) => {
                const isSelected = session.id === selectedSessionId
                const isActive = session.status === 'active'
                const hasActivity = sessionsWithActivity.has(session.id)
                const showGreen = isActive || hasActivity

                return (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className="group w-full px-1.5 py-0.5 rounded transition-all flex items-center gap-1"
                    style={{
                      whiteSpace: 'nowrap',
                      background: isSelected ? COLORS.tabSelectedBg : COLORS.tabInactiveBg,
                      border: `1px solid ${isSelected ? COLORS.tabSelectedBorder : COLORS.tabInactiveBorder}`,
                      color: isSelected ? COLORS.holoBright : COLORS.textMuted,
                    }}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: showGreen ? COLORS.complete : COLORS.idle + '40',
                        boxShadow: showGreen ? `0 0 4px ${COLORS.complete}` : 'none',
                        animation: hasActivity && !isSelected ? 'pulse 1.5s infinite' : 'none',
                      }}
                    />
                    <span className="truncate flex-1 text-left">{session.label}</span>
                    <span
                      className="ml-0.5 opacity-0 group-hover:opacity-60 transition-opacity cursor-pointer flex-shrink-0"
                      style={{ color: COLORS.tabClose, fontSize: 8, lineHeight: '10px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onCloseSession(session.id)
                      }}
                    >
                      ✕
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
})
