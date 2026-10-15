/**
 * Engine tests: exercise `git.js` against a real temporary repository.
 * Run with: node --test dsh-git-manager/test/git.test.mjs
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  branches,
  commitDetail,
  currentBranch,
  diff,
  discover,
  dispatch,
  GitError,
  log,
  remotes,
  resolveRepo,
  runGit,
  stashes,
} from '../git.js'

let root
const config = { repos: [], maxCommits: 100, timeoutMs: 20_000, networkTimeoutMs: 60_000 }

async function write(name, content) {
  const target = path.join(root, name)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.writeFile(target, content, 'utf8')
}

before(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-git-test-'))
  await runGit(root, ['init', '-q', '-b', 'main'])
  await runGit(root, ['config', 'user.name', 'Tester'])
  await runGit(root, ['config', 'user.email', 'tester@example.com'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
})

after(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true })
})

test('an empty repository opens with an empty log', async () => {
  const info = await resolveRepo(root)
  assert.equal(info.name, path.basename(root))
  const head = await currentBranch(root)
  assert.equal(head.branch, 'main')
  assert.equal(head.sha, null)
  const history = await log(root, {}, config)
  assert.deepEqual(history.commits, [])
})

test('status, stage and commit round-trip', async () => {
  await write('a.txt', 'one\n')
  let status = (await dispatch({ op: 'status', repo: root }, { config })).status
  assert.equal(status.files.length, 1)
  assert.equal(status.files[0].path, 'a.txt')
  assert.equal(status.files[0].untracked, true)

  await dispatch({ op: 'stage', repo: root, paths: ['a.txt'] }, { config })
  status = (await dispatch({ op: 'status', repo: root }, { config })).status
  assert.equal(status.files[0].staged, true)
  assert.equal(status.files[0].untracked, false)

  const committed = await dispatch({ op: 'commitStaged', repo: root, message: 'first\n' }, { config })
  assert.match(committed.sha, /^[0-9a-f]{40}$/)
  status = (await dispatch({ op: 'status', repo: root }, { config })).status
  assert.equal(status.files.length, 0)
})

test('log returns parents for graph assembly', async () => {
  await write('a.txt', 'two\n')
  await dispatch({ op: 'stage', repo: root, paths: ['a.txt'] }, { config })
  await dispatch({ op: 'commitStaged', repo: root, message: 'second' }, { config })

  const history = await log(root, {}, config)
  assert.equal(history.commits.length, 2)
  assert.equal(history.end, true)
  const [newest, oldest] = history.commits
  assert.equal(newest.subject, 'second')
  assert.deepEqual(newest.parents, [oldest.hash])
  assert.deepEqual(oldest.parents, [])
})

test('commit detail lists changed files with line counts', async () => {
  const history = await log(root, { max: 1 }, config)
  const detail = await commitDetail(root, { sha: history.commits[0].hash })
  assert.equal(detail.subject, 'second')
  assert.equal(detail.files.length, 1)
  assert.equal(detail.files[0].path, 'a.txt')
  assert.equal(detail.files[0].additions, 1)
})

test('diff of a commit and of the working tree', async () => {
  const history = await log(root, { max: 2 }, config)
  const patch = await diff(root, { sha: history.commits[0].hash })
  assert.match(patch.diff, /\+two/)

  await write('a.txt', 'three\n')
  const worktree = await diff(root, {})
  assert.match(worktree.diff, /-two/)
  assert.match(worktree.diff, /\+three/)
})

test('branches, checkout and tags', async () => {
  await dispatch({ op: 'createBranch', repo: root, name: 'feature/x', checkout: true }, { config })
  const tree = await branches(root)
  assert.equal(tree.head, 'feature/x')
  const feature = tree.local.find((entry) => entry.name === 'feature/x')
  const main = tree.local.find((entry) => entry.name === 'main')
  assert.ok(feature && main)
  assert.equal(feature.current, true)
  assert.equal(main.current, false)
  assert.ok(feature.sha && main.sha)

  await dispatch({ op: 'createTag', repo: root, name: 'v1.0.0', message: 'release' }, { config })
  const tagged = await branches(root)
  assert.deepEqual(tagged.tags.map((tag) => tag.name), ['v1.0.0'])

  await dispatch({ op: 'checkout', repo: root, ref: 'main' }, { config })
  assert.equal((await currentBranch(root)).branch, 'main')
  await dispatch({ op: 'deleteBranch', repo: root, name: 'feature/x', force: true }, { config })
  assert.equal((await branches(root)).local.some((entry) => entry.name === 'feature/x'), false)
})

test('stash push, list and pop', async () => {
  await write('a.txt', 'stashed\n')
  await dispatch({ op: 'stashPush', repo: root, message: 'wip' }, { config })
  const list = await stashes(root)
  assert.equal(list.length, 1)
  assert.equal(list[0].index, 0)
  assert.match(list[0].subject, /wip/)
  await dispatch({ op: 'stashPop', repo: root }, { config })
  assert.equal((await stashes(root)).length, 0)
  await dispatch({ op: 'discard', repo: root, paths: ['a.txt'] }, { config })
  assert.equal((await dispatch({ op: 'status', repo: root }, { config })).status.files.length, 0)
})

test('discard removes an untracked file', async () => {
  await write('junk.txt', 'junk\n')
  await dispatch({ op: 'discard', repo: root, paths: ['junk.txt'], untracked: true }, { config })
  const status = (await dispatch({ op: 'status', repo: root }, { config })).status
  assert.equal(status.files.length, 0)
  await assert.rejects(fsp.stat(path.join(root, 'junk.txt')))
})

test('remotes projection', async () => {
  await dispatch({ op: 'addRemote', repo: root, name: 'origin', url: 'https://example.com/repo.git' }, { config })
  const list = await remotes(root)
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'origin')
  assert.equal(list[0].fetchUrl, 'https://example.com/repo.git')
  await dispatch({ op: 'removeRemote', repo: root, name: 'origin' }, { config })
  assert.equal((await remotes(root)).length, 0)
})

test('discover finds registered workspaces and skips non-repositories', async () => {
  const plain = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-git-plain-'))
  const canonicalRoot = await fsp.realpath(root)
  const registry = { list: () => [{ path: root, title: 'Repo' }, { path: plain, title: 'Plain' }] }
  const result = await discover({ ...config, repos: [path.join(os.tmpdir(), 'does-not-exist')] }, registry)
  const found = result.repos.find((entry) => entry.path === canonicalRoot)
  assert.equal(found.isRepo, true)
  assert.equal(found.title, 'Repo')
  assert.equal(typeof found.branch, 'string')
  const notRepo = result.repos.find((entry) => entry.path === plain)
  assert.equal(notRepo.isRepo, false)
  const missing = result.repos.find((entry) => entry.path.includes('does-not-exist'))
  assert.equal(missing.isRepo, false)
  await fsp.rm(plain, { recursive: true, force: true })
})

test('the dispatcher rejects invalid input instead of running it', async () => {
  await assert.rejects(dispatch({ op: 'status', repo: '/definitely/not/here' }, { config }), GitError)
  await assert.rejects(dispatch({ op: 'checkout', repo: root, ref: '--upload-pack=touch /tmp/x' }, { config }), GitError)
  await assert.rejects(dispatch({ op: 'createBranch', repo: root, name: '-x' }, { config }), GitError)
  await assert.rejects(dispatch({ op: 'commitStaged', repo: root, message: '  ' }, { config }), GitError)
  await assert.rejects(dispatch({ op: 'nope', repo: root }, { config }), GitError)
  await assert.rejects(dispatch({ op: 'merge', repo: root, ref: '$(rm -rf /)' }, { config }), GitError)
})

test('the version operation reports the installed git', async () => {
  const result = await dispatch({ op: 'version' }, { config })
  assert.match(result.version, /^git version/)
})

test('snapshot returns the whole panel state in one call', async () => {
  const snapshot = await dispatch({ op: 'snapshot', repo: root }, { config })
  assert.equal(snapshot.summary.name, path.basename(root))
  assert.equal(snapshot.status.branch, 'main')
  assert.ok(Array.isArray(snapshot.branches.local))
  assert.ok(snapshot.log.commits.length >= 2)
  assert.ok(Array.isArray(snapshot.stashes))
  assert.ok(Array.isArray(snapshot.remotes))
  assert.equal(typeof snapshot.identity.userName, 'string')
})

test('discover accepts client-supplied extra repositories', async () => {
  const result = await discover(config, undefined, [{ path: root, title: '客户端附加' }])
  const found = result.repos.find((entry) => entry.title === '客户端附加')
  assert.equal(found.isRepo, true)
})

test('the symbolic remote HEAD is not listed as a remote branch', async () => {
  await runGit(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  await runGit(root, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
  const tree = await branches(root)
  const origin = tree.remotes.find((group) => group.remote === 'origin')
  assert.deepEqual(origin.branches.map((branch) => branch.name), ['origin/main'])
  assert.equal(tree.remotes.some((group) => group.branches.some((branch) => branch.name === 'origin')), false)
})

test('an untracked file diffs against /dev/null instead of showing nothing', async () => {
  await write('brand-new.txt', 'alpha\nbeta\n')
  // The plain working-tree diff really is empty for an untracked path.
  const plain = await diff(root, { path: 'brand-new.txt' })
  assert.match(plain.diff, /^diff --git /m, 'the engine falls back automatically')
  assert.match(plain.diff, /^--- \/dev\/null$/m)
  assert.match(plain.diff, /^\+alpha$/m)
  assert.equal(plain.untracked, true)

  // The explicit flag takes the same path (what the panel sends).
  const flagged = await diff(root, { path: 'brand-new.txt', untracked: true })
  assert.match(flagged.diff, /^\+beta$/m)

  // The dispatcher exposes it too.
  const viaDispatch = await dispatch({ op: 'diff', repo: root, path: 'brand-new.txt', untracked: true }, { config })
  assert.match(viaDispatch.diff, /^\+alpha$/m)

  // A tracked file with no changes stays empty, without a false /dev/null diff.
  await dispatch({ op: 'stage', repo: root, paths: ['brand-new.txt'] }, { config })
  await dispatch({ op: 'commitStaged', repo: root, message: 'add brand new' }, { config })
  const unchanged = await diff(root, { path: 'brand-new.txt' })
  assert.equal(unchanged.diff.trim(), '')
})

test('squash collapses a middle range and replays the commits above it', async () => {
  const branch = `squash-${Date.now()}`
  await runGit(root, ['checkout', '-q', '-b', branch])
  for (const name of ['s1', 's2', 's3', 's4', 's5']) {
    await write(`${name}.txt`, `${name}\n`)
    await runGit(root, ['add', '--all'])
    await runGit(root, ['commit', '-q', '-m', `commit ${name}`])
  }
  const base = (await runGit(root, ['rev-parse', 'HEAD~4'])).stdout.trim()
  const oldest = (await runGit(root, ['rev-parse', 'HEAD~3'])).stdout.trim()
  const newer = (await runGit(root, ['rev-parse', 'HEAD~2'])).stdout.trim()
  const newest = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  const tip = (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim()

  const middle = (await runGit(root, ['rev-parse', 'HEAD~2'])).stdout.trim()
  // Preview reports the chain oldest-first and the combined message.
  const preview = await dispatch({ op: 'squashPreview', repo: root, shas: [newest, middle, oldest] }, { config })
  assert.deepEqual(preview.commits.map((entry) => entry.subject), ['commit s2', 'commit s3', 'commit s4'])
  assert.match(preview.defaultMessage, /commit s2[\s\S]*commit s4/)
  assert.equal(preview.base, base)

  // Selection order must not matter.
  const result = await dispatch({
    op: 'squash',
    repo: root,
    shas: [newest, oldest, newer, middle],
    message: 'squashed s2..s4',
  }, { config })
  assert.equal(result.squash.count, 3)
  assert.equal(result.squash.previousHead, tip)

  const history = (await runGit(root, ['log', '--format=%s', '-3'])).stdout.trim().split('\n')
  assert.deepEqual(history, ['commit s5', 'squashed s2..s4', 'commit s1'])
  // The checked-out branch must end up moved to the rewritten history, not
  // left behind while HEAD dangles on a detached commit.
  assert.equal((await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(), branch)
  assert.equal((await runGit(root, ['rev-parse', branch])).stdout.trim(), (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim())
  // Every file from the squashed range survives, including the replayed s5.
  for (const name of ['s1', 's2', 's3', 's4', 's5']) {
    await fsp.access(path.join(root, `${name}.txt`))
  }
  // The squashed commit keeps the oldest commit's author and its parent is base.
  const parent = (await runGit(root, ['rev-parse', 'HEAD~1^'])).stdout.trim()
  assert.equal(parent, base)
  const author = (await runGit(root, ['show', '-s', '--format=%an', 'HEAD~1'])).stdout.trim()
  assert.equal(author, 'Tester')
})

test('squash works when the range ends at HEAD', async () => {
  const branch = `squash-tip-${Date.now()}`
  await runGit(root, ['checkout', '-q', '-b', branch])
  for (const name of ['t1', 't2', 't3']) {
    await write(`${name}.txt`, `${name}\n`)
    await runGit(root, ['add', '--all'])
    await runGit(root, ['commit', '-q', '-m', `tip ${name}`])
  }
  const oldest = (await runGit(root, ['rev-parse', 'HEAD~2'])).stdout.trim()
  const middle = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  const before = (await runGit(root, ['rev-parse', 'HEAD~3'])).stdout.trim()
  const countBefore = Number((await runGit(root, ['rev-list', '--count', 'HEAD'])).stdout.trim())

  const result = await dispatch({ op: 'squash', repo: root, shas: [oldest, 'HEAD', middle] }, { config })
  assert.equal(result.squash.count, 3)
  assert.equal((await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim(), result.squash.sha)
  // Three commits became one, on top of the same parent, keeping the combined message.
  assert.equal(Number((await runGit(root, ['rev-list', '--count', 'HEAD'])).stdout.trim()), countBefore - 2)
  assert.equal((await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim(), before)
  assert.equal((await runGit(root, ['log', '--format=%s', '-1'])).stdout.trim(), 'tip t1')
  // Regression: `git rebase --onto … HEAD` with nothing to replay used to detach
  // HEAD and leave the branch untouched.
  assert.equal((await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(), branch)
  assert.equal((await runGit(root, ['rev-parse', branch])).stdout.trim(), result.squash.sha)
  assert.equal(result.squash.branch, branch)
  const body = (await runGit(root, ['log', '--format=%B', '-1'])).stdout
  assert.match(body, /tip t2/)
  assert.match(body, /tip t3/)
})

test('squash refuses what it cannot rewrite', async () => {
  const branch = `squash-bad-${Date.now()}`
  await runGit(root, ['checkout', '-q', '-b', branch])
  for (const name of ['b1', 'b2', 'b3']) {
    await write(`${name}.txt`, `${name}\n`)
    await runGit(root, ['add', '--all'])
    await runGit(root, ['commit', '-q', '-m', `bad ${name}`])
  }
  const head = (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim()
  const parent = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  const grand = (await runGit(root, ['rev-parse', 'HEAD~2'])).stdout.trim()

  await assert.rejects(dispatch({ op: 'squash', repo: root, shas: [head] }, { config }), /至少选择两个提交/)
  // Non-contiguous: HEAD and its grandparent skip the middle commit.
  await assert.rejects(dispatch({ op: 'squashPreview', repo: root, shas: [head, grand] }, { config }), /连续的一段/)
  // A contiguous range previews cleanly ...
  const preview = await dispatch({ op: 'squashPreview', repo: root, shas: [parent, head] }, { config })
  assert.equal(preview.dirty, false)
  assert.deepEqual(preview.commits.map((entry) => entry.subject), ['bad b2', 'bad b3'])
  // ... and a tracked modification blocks the rewrite itself.
  await write('b1.txt', 'dirty again\n')
  assert.equal((await dispatch({ op: 'squashPreview', repo: root, shas: [parent, head] }, { config })).dirty, true)
  await assert.rejects(
    dispatch({ op: 'squash', repo: root, shas: [parent, head], message: 'x' }, { config }),
    /未提交的改动/,
  )
  await runGit(root, ['checkout', '--', 'b1.txt'])
  // A contiguous pair that is not part of the current HEAD is refused.
  await runGit(root, ['checkout', '-q', '-b', `squash-away-${Date.now()}`, grand])
  await write('away.txt', 'away\n')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'away'])
  const awayTip = (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim()
  const awayParent = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  await runGit(root, ['checkout', '-q', branch])
  await assert.rejects(
    dispatch({ op: 'squashPreview', repo: root, shas: [awayTip, awayParent] }, { config }),
    /HEAD 历史/,
  )
  await runGit(root, ['checkout', '-q', 'main'])
})

test('capabilities names the new engine operations', async () => {
  const caps = await dispatch({ op: 'capabilities' }, { config })
  assert.equal(caps.engine, 2)
  assert.ok(caps.ops.includes('squash'))
})

test('squash keeps HEAD attached to its branch and never dangles', async () => {
  const branch = `squash-attach-${Date.now()}`
  await runGit(root, ['checkout', '-q', '-b', branch])
  for (const name of ['k1', 'k2', 'k3', 'k4']) {
    await write(`${name}.txt`, `${name}\n`)
    await runGit(root, ['add', '--all'])
    await runGit(root, ['commit', '-q', '-m', `attach ${name}`])
  }
  const branchBefore = (await runGit(root, ['rev-parse', branch])).stdout.trim()

  // Range at the tip.
  const top = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  const tipResult = await dispatch({ op: 'squash', repo: root, shas: [top, 'HEAD'] }, { config })
  assert.equal((await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(), branch)
  assert.equal((await runGit(root, ['rev-parse', branch])).stdout.trim(), tipResult.squash.sha)

  // Range in the middle, with a descendant to replay.
  const mid = (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim()
  const below = (await runGit(root, ['rev-parse', 'HEAD~2'])).stdout.trim()
  const midResult = await dispatch({ op: 'squash', repo: root, shas: [below, mid] }, { config })
  assert.equal((await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(), branch)
  const tipNow = (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim()
  assert.equal((await runGit(root, ['rev-parse', branch])).stdout.trim(), tipNow)
  assert.notEqual(tipNow, branchBefore)
  // The replayed descendant still sits on top of the squashed commit.
  assert.equal((await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim(), midResult.squash.sha)
  // The replayed descendant is the first squash's commit, whose subject is the
  // oldest of ITS members and whose body carries the rest.
  assert.equal((await runGit(root, ['log', '--format=%s', '-1'])).stdout.trim(), 'attach k3')
  assert.match((await runGit(root, ['log', '--format=%B', '-1'])).stdout, /attach k4/)
  await runGit(root, ['checkout', '-q', 'main'])
})

test('the preview reports the net change and flags a self-cancelling range', async () => {
  const branch = `squash-net-${Date.now()}`
  await runGit(root, ['checkout', '-q', '-b', branch])
  await write('flip.txt', 'active: dev\n')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'net: base file'])

  // A range whose net effect is real.
  await write('net-new.txt', 'hello\n')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'net: add file'])
  const added = await dispatch({
    op: 'squashPreview',
    repo: root,
    shas: [(await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim(), 'HEAD'],
  }, { config })
  assert.ok(added.stat.files >= 1, 'the range has a real net change')
  assert.ok(added.stat.additions >= 1)
  assert.equal(added.netEmpty, false)

  // Two commits that flip a line and flip it straight back: the net change is
  // zero, which is exactly the pair that showed up as 变更文件（0）.
  await write('flip.txt', 'active: prod\n')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'flip: dev -> prod'])
  await write('flip.txt', 'active: dev\n')
  await runGit(root, ['add', '--all'])
  await runGit(root, ['commit', '-q', '-m', 'flip: prod -> dev'])
  const hashes = [
    (await runGit(root, ['rev-parse', 'HEAD~1'])).stdout.trim(),
    (await runGit(root, ['rev-parse', 'HEAD'])).stdout.trim(),
  ]
  const pair = await dispatch({ op: 'squashPreview', repo: root, shas: hashes }, { config })
  assert.equal(pair.stat.files, 0, 'the two edits cancel out')
  assert.equal(pair.netEmpty, true)

  const result = await dispatch({ op: 'squash', repo: root, shas: hashes, message: 'squashed net zero' }, { config })
  assert.equal(result.squash.netEmpty, true)
  assert.equal(result.squash.stat.files, 0)
  // The commit exists, carries the message, and its diff against the parent is
  // empty — the same thing git's or the IDE's squash produces here.
  assert.equal((await runGit(root, ['diff', '--numstat', 'HEAD^', 'HEAD'])).stdout.trim(), '')
  assert.equal((await runGit(root, ['log', '--format=%s', '-1'])).stdout.trim(), 'squashed net zero')
  assert.equal((await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(), branch)
  // And the file content is untouched by the rewrite.
  assert.equal((await fsp.readFile(path.join(root, 'flip.txt'), 'utf8')).trim(), 'active: dev')
  await runGit(root, ['checkout', '-q', 'main'])
})
