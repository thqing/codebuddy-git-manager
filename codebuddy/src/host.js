/**
 * Host adapter shared by the CodeBuddy Webview and the optional language-model
 * tool. It mirrors the DSH Host half in `index.js`: one Git engine, one
 * per-repository mutation queue, and JSON-safe failure envelopes.
 */
import { GitError, dispatch } from '../../git.js'

/** Mutating operations that must not interleave on the same repository. */
export const SERIALIZED_OPS = new Set([
  'stage',
  'stageAll',
  'unstage',
  'unstageAll',
  'discard',
  'commitStaged',
  'checkout',
  'createBranch',
  'deleteBranch',
  'renameBranch',
  'merge',
  'mergeAbort',
  'rebase',
  'rebaseAbort',
  'rebaseContinue',
  'cherryPick',
  'revert',
  'reset',
  'squash',
  'fetch',
  'pull',
  'updateProject',
  'push',
  'deleteRemoteBranch',
  'addRemote',
  'removeRemote',
  'setRemoteUrl',
  'createTag',
  'deleteTag',
  'pushTag',
  'stashPush',
  'stashPop',
  'stashApply',
  'stashDrop',
  'identity',
  'init',
])

/** Serialize work per repository so a double click cannot interleave mutations. */
export function createQueue() {
  const tails = new Map()
  return function enqueue(key, run) {
    const previous = tails.get(key) ?? Promise.resolve()
    const next = previous.then(run, run)
    const settled = next.then(() => {}, () => {})
    tails.set(key, settled)
    settled.then(() => {
      if (tails.get(key) === settled) tails.delete(key)
    })
    return next
  }
}

/** Turn any failure into the Webview's failure envelope. */
export function failureOf(error) {
  if (error instanceof GitError) {
    return {
      ok: false,
      message: error.message,
      detail: error.detail ?? '',
      code: 'git',
    }
  }
  return {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    detail: '',
    code: 'internal',
  }
}

/**
 * Create the host-side dispatcher consumed by the Webview RPC bridge.
 * @param {object} options
 * @param {() => object} options.getConfig current extension settings
 * @param {() => object | undefined} options.getWorkspaceRegistry adapter with `list()`
 * @param {{warn?: Function, error?: Function, log?: Function}} [options.logger]
 */
export function createGitHost({ getConfig, getWorkspaceRegistry, logger } = {}) {
  const enqueue = createQueue()

  const deps = () => ({
    config: typeof getConfig === 'function' ? getConfig() : {},
    workspaceRegistry: typeof getWorkspaceRegistry === 'function' ? getWorkspaceRegistry() : undefined,
  })

  async function run(payload) {
    const request = payload && typeof payload === 'object' ? payload : {}
    const op = typeof request.op === 'string' ? request.op : ''
    if (SERIALIZED_OPS.has(op)) {
      const key = typeof request.repo === 'string' && request.repo !== '' ? request.repo : '*'
      return enqueue(key, () => dispatch(request, deps()))
    }
    return dispatch(request, deps())
  }

  function report(error) {
    const failure = failureOf(error)
    logger?.error?.(`${failure.message}${failure.detail ? ` (${failure.detail})` : ''}`)
    return failure
  }

  return { run, report }
}
