# Git scope

Use the two snapshots that define the requested change. Record the comparison mode and versions in **Scope**. Read unchanged dependencies and context from the same snapshot as the evidence they support.

For patch reads, apply the comparison arguments below to `git --no-pager --no-optional-locks -c diff.autoRefreshIndex=false diff --no-ext-diff --no-textconv`. This keeps automatic index refresh and repository-configured presentation helpers out of the audit read. Read the relevant blobs separately when the raw comparison cannot display their contents. [Git diff options](https://git-scm.com/docs/diff-options) · [Git diff configuration](https://git-scm.com/docs/diff-config.html)

If the user pins a supplied criterion to a revision or to the index, read it from that version too. Record its snapshot-qualified path and the blob ID from `git rev-parse <revision>:<path>` or `git rev-parse :<path>` for the index. A criterion supplied as a separate current file keeps the version the user supplied.

| Requested change | Comparison | Read the resulting version |
| --- | --- | --- |
| Staged changes | `git diff --cached` | Git index with `git show :path/to/file` |
| Unstaged changes | `git diff` | Working tree |
| All tracked local changes | `git diff HEAD`, or `git diff <empty-tree>` before the first commit | Working tree |
| An ordinary commit | Its parent to the commit | `git show <target-commit>:path/to/file` |
| The initial commit | The empty tree to the commit, for example `git diff-tree --root -p <commit>` | `git show <target-commit>:path/to/file` |
| A merge commit | The requested parent, or the first parent for the change introduced on the receiving branch | `git show <target-commit>:path/to/file` |
| A commit range | Requested base and target revisions. For a three-dot diff, use the merge base. | `git show <target-commit>:path/to/file` |

For a merge, use an explicit parent-to-result diff such as `git diff <merge>^1 <merge>`. The default combined diff can omit a change brought in unchanged from one parent. Record the resolved parent and result commits in the report.

For `base...target`, resolve the merge base and record it alongside the named base and target. Check the changed behavior and unchanged dependencies at the target revision. The named base may have progressed independently and the checkout may be on either branch.

Before the first commit, `git diff --cached` compares the index with an empty tree. For all tracked local changes, compute the repository's empty tree ID by feeding zero bytes to `git hash-object -t tree --stdin`, then compare that ID with the working tree. Use the repository's object format and leave its object database untouched. [Git diff](https://git-scm.com/docs/git-diff) · [Git hash-object](https://git-scm.com/docs/git-hash-object)

For a staged audit, use `git ls-files --unmerged` when the index contains conflicts. An unmerged path has no stage-0 result. Record it in **Local changes**, leave checks that require that version open, and explain which staged resolution would let you finish. Continue with resolvable index paths. Use the working tree or a conflict stage only when that version is explicitly in scope.

An intent-to-add entry created by `git add -N` belongs to the working-tree changes until its content is staged. Check the cached diff and status before treating an index entry as a staged change. Audit the new content from the working tree when unstaged changes are in scope.

Check untracked files separately when the user includes them. For a deleted line or a file that no longer exists in the result, cite the before-snapshot and path.

Treat a file move or deletion as a path change even if the patch has no changed content lines. Compare source and destination paths and follow references affected by the move, such as relative links or imports. Use the before and after snapshots to distinguish a break caused by the move from one already present.

For a deletion, verify the path is absent in the result snapshot and check any retained references in that snapshot. A staged deletion can coexist with a working copy at the same path. For a staged audit, verify absence and reference resolution in the index.

A worktree link can land on a different line or show different content from the index or a commit. For such evidence, use a snapshot-qualified locator with the line number, such as `index:README.md:9` or `<commit>:README.md:9`. If a link to the exact version is available, use that link. Record enough of the observed change for the reader to recognize the evidence.
