# Development and releases

NextCourse develops in public. A pushed development branch is not a stable release.

| Branch or tag | Purpose |
| --- | --- |
| `main` | Reviewed integration branch; merge through pull requests after tests pass. |
| `codex/lego-modularity-core` | Course composition domain APIs, schemas, CLI integration and core regression tests. |
| `codex/studio-ui` | Studio web UI, local HTTP server, preview interactions and Studio CLI entry point; based on the core branch. |
| Version tags, such as `v4.1` | Fixed release snapshots. Development pushes do not move existing tags. |

Keep shared composition logic in the core branch. Studio consumes those APIs; do not
make core development depend on the browser UI. When updating the UI branch, merge
reviewed core changes into it rather than copying shared source files. UI development
is currently deferred; its existing MVP is retained for later interaction and visual design.

Run `npm test` and `git diff --check` before pushing. CI runs tests only; it does not
publish packages, deploy applications or create releases. Protect `main` with required
pull requests and the `Node.js tests` status check. For a solo maintainer, a second
reviewer is not required, but the pull request and passing checks still are.

Release deliberately: review the final scope, merge the release-ready changes, create
a version tag, then publish the package explicitly. Use a prerelease version and the
`beta` or `next` npm dist-tag for testing; reserve `latest` for stable releases. Consumers
who need fixed source should use a version tag or commit rather than a moving branch.

Real courses, customer materials, local credentials, tool logs and internal development
notes stay outside the public repository. Course content and internal handoff notes use
separate private NAS repositories. NAS is not the normal destination for public engine
feature development.
