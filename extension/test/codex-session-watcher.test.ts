import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { codexSessionsRoot, pathMatchesWorkspace } from '../src/codex-session-watcher'

describe('codexSessionsRoot', () => {
  it('appends sessions to a Windows Codex home root', () => {
    assert.equal(
      codexSessionsRoot('C:\\Users\\MiguelGrillo\\.codex', 'win32'),
      'C:\\Users\\MiguelGrillo\\.codex\\sessions',
    )
  })

  it('does not double-append sessions when Windows CODEX_HOME already points there', () => {
    assert.equal(
      codexSessionsRoot('C:\\Users\\MiguelGrillo\\.codex\\sessions', 'win32'),
      'C:\\Users\\MiguelGrillo\\.codex\\sessions',
    )
  })

  it('preserves POSIX Codex home behavior', () => {
    assert.equal(
      codexSessionsRoot('/home/miguel/.codex', 'linux'),
      '/home/miguel/.codex/sessions',
    )
    assert.equal(
      codexSessionsRoot('/home/miguel/.codex/sessions/', 'linux'),
      '/home/miguel/.codex/sessions',
    )
  })
})

describe('pathMatchesWorkspace', () => {
  it('matches Windows workspace paths case-insensitively', () => {
    assert.equal(
      pathMatchesWorkspace(
        'c:\\Users\\MiguelGrillo\\Documents\\github-repos\\agent-flow',
        'C:\\Users\\MiguelGrillo\\Documents\\github-repos\\agent-flow',
        'win32',
      ),
      true,
    )
  })

  it('matches Windows child paths without matching sibling prefixes', () => {
    const workspace = 'C:\\Repo\\agent-flow'

    assert.equal(
      pathMatchesWorkspace('c:\\repo\\agent-flow\\subdir', workspace, 'win32'),
      true,
    )
    assert.equal(
      pathMatchesWorkspace('c:\\repo\\agent-flow-other', workspace, 'win32'),
      false,
    )
  })

  it('keeps POSIX matching case-sensitive', () => {
    assert.equal(pathMatchesWorkspace('/repo/agent-flow', '/repo/agent-flow', 'linux'), true)
    assert.equal(pathMatchesWorkspace('/Repo/agent-flow', '/repo/agent-flow', 'linux'), false)
    assert.equal(pathMatchesWorkspace('/repo/agent-flow/subdir', '/repo/agent-flow', 'linux'), true)
    assert.equal(pathMatchesWorkspace('/repo/agent-flow-other', '/repo/agent-flow', 'linux'), false)
  })
})
