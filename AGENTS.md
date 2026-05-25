# Repository Agent Instructions

## Routine Git Operations

For straightforward commit and push requests, keep the workflow minimal:

1. Run `git status` to identify intended and unrelated changes.
2. Stage only the files related to the completed task.
3. Create the commit.
4. Push the current branch.
5. Report the commit hash and any intentionally uncommitted files.

Do not repeat tests, builds, diff reviews, remote inspection, or history inspection if the implementation was already verified and the commit scope is clear. Only perform additional checks when there is ambiguity or risk.
