/**
 * Agent-tool projection of the Git engine. The action names and summaries are
 * kept in parity with the DSH `git_manage` tool in the repository root.
 */

export const TOOL_ACTIONS = {
  status: 'status',
  repo_info: 'open',
  branches: 'branches',
  log: 'log',
  commit_detail: 'commit',
  diff: 'diff',
  fetch: 'fetch',
  pull: 'pull',
  update_project: 'updateProject',
  push: 'push',
  stage: 'stage',
  unstage: 'unstage',
  discard: 'discard',
  commit_staged: 'commitStaged',
  checkout: 'checkout',
  create_branch: 'createBranch',
  delete_branch: 'deleteBranch',
  merge: 'merge',
  rebase: 'rebase',
  revert: 'revert',
  reset: 'reset',
  squash: 'squash',
  squash_preview: 'squashPreview',
  cherry_pick: 'cherryPick',
  stash_push: 'stashPush',
  stash_pop: 'stashPop',
  stash_list: 'stashes',
  create_tag: 'createTag',
  remotes: 'remotes',
  discover: 'discover',
}

export const TOOL_ARGUMENTS = [
  'repo',
  'ref',
  'name',
  'message',
  'paths',
  'remote',
  'branch',
  'sha',
  'mode',
  'startPoint',
  'strategy',
  'max',
  'shas',
]

/** Convert model tool input into the engine's request payload. */
export function toPayload(input, defaultRepo) {
  const source = input && typeof input === 'object' ? input : {}
  const action = TOOL_ACTIONS[source.action]
  if (action === undefined) throw new Error(`未知 action：${String(source.action)}`)
  const payload = { op: action }
  for (const key of TOOL_ARGUMENTS) {
    if (source[key] !== undefined) payload[key] = source[key]
  }
  if (payload.repo === undefined && typeof defaultRepo === 'string' && defaultRepo !== '') {
    payload.repo = defaultRepo
  }
  return payload
}

/** Concise model-facing text for one operation result. */
export function summarize(action, data) {
  if (!data || typeof data !== 'object') return `${action}: 完成`
  if (action === 'branches') {
    const remoteCount = (data.remotes ?? []).reduce(
      (total, group) => total + (group.branches?.length ?? 0),
      0,
    )
    return `本地分支 ${data.local?.length ?? 0} 个，远程分支 ${remoteCount} 个（${data.remotes?.length ?? 0} 个远程），标签 ${data.tags?.length ?? 0} 个，当前分支 ${data.head ?? '(detached)'}`
  }
  if (action === 'log') return `返回 ${data.commits?.length ?? 0} 条提交`
  if (action === 'squash') {
    return `已把 ${data.squash?.count ?? 0} 个提交压缩为 ${data.squash?.sha ?? ''}（原 HEAD ${data.squash?.previousHead ?? ''}，可用 git reset --hard 恢复）`
  }
  if (action === 'squash_preview') {
    return `将压缩 ${data.commits?.length ?? 0} 个提交：${(data.commits ?? []).map((entry) => entry.subject).join(' | ')}`
  }
  if (action === 'status') {
    return `当前分支 ${data.status?.branch ?? '(detached)'}，变更 ${data.status?.files?.length ?? 0} 个`
  }
  if (action === 'update_project') {
    if (data.updated === false) return `${data.branch} 已经是最新的（${data.upstream}）`
    const verb = data.strategy === 'rebase' ? '变基' : data.strategy === 'reset' ? '重置' : '合并'
    return `已把 ${data.upstream} 的 ${data.behind} 个提交${verb}到 ${data.branch}`
  }
  if (action === 'diff') {
    return data.diff
      ? `差异 ${String(data.diff).length} 字符${data.truncated ? '（已截断）' : ''}`
      : '无差异'
  }
  if (action === 'discover') {
    const repos = (data.repos ?? []).filter((entry) => entry.isRepo)
    return `发现 ${repos.length} 个 Git 仓库：${repos.map((entry) => entry.path).join(', ') || '(无)'}`
  }
  if (typeof data.output === 'string' && data.output.trim() !== '') return data.output.trim()
  if (typeof data.sha === 'string') return `提交成功：${data.sha}`
  return `${action}: 完成`
}
