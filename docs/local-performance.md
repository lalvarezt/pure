# Personal performance fork

The `experiments` branch contains the local performance changes. Install it with:

```fish
fisher install lalvarezt/pure@experiments
```

Fisher and Topgrade update that branch directly. No local patch needs to be
reapplied. The `master` branch remains an upstream base. New upstream changes
reach `experiments` after an explicit merge and validation.

## Performance decisions

- Noninteractive startup skips prompt defaults and the newline hook. Fisher
  lifecycle handlers explicitly initialize defaults when needed.
- Default-setting logic preserves universal settings and global overrides.
- Git rendering reads one porcelain-v2 status snapshot per render. It retains
  dirty state, stashes, numbered indicators, and upstream divergence. Detached
  HEADs display a short commit ID instead of running `git name-rev`.
- Git state refreshes on each render. Caching by directory would hide edits,
  commits, and stashes made in the current directory.
- Container detection uses builtins and readable `/proc` files. The normal
  result is cached within the shell and invalidated when `$container` changes.
- Username display uses `$USER`, with a cached `id` fallback when it is empty.
- Directory suffixes use array slices instead of `tail`.

The combined Git renderer honors Pure's color and symbol settings. Custom
redefinitions of the individual Git rendering helpers do not change it.
Existing fish-async-prompt integration remains supported.

## Local checks

Use Node, Fish, and Git on the host:

```sh
node scripts/test-performance.cjs
```

The harness creates isolated homes, configuration directories, and Git fixtures.
To also exercise the existing async plugin from a chezmoi checkout, run:

```sh
PURE_ASYNC_CONFIG="$(chezmoi source-path)/dot_config/fish/conf.d" node scripts/test-performance.cjs
```

Failed checks append diagnostic records to
`$XDG_STATE_HOME/pure-performance/validation-failures.jsonl`, defaulting to
`~/.local/state/pure-performance/validation-failures.jsonl`. The record includes
the failed assertions and preserved fixture directory. Successful runs remove
their own fixtures and keep previous failure records.

## Measurements

Run:

```sh
node scripts/profile-performance.cjs docs/pure-performance-results.json
```

The baseline is `upstream/master`; `PURE_BASELINE` can select another Git ref.
The script compares upstream, the original startup guards, and this fork using
isolated configurations, warm universal defaults, and a temporary repository.
It also writes a standalone HTML chart.

The recorded full-prompt cases render synchronously without the async plugin.
Repeated-render values include amortized startup. These measurements do not
measure terminal readiness or large repository history scans.

## Upstream maintenance

Fetch upstream, advance local `master` to `upstream/master`, and merge `master`
into `experiments`. Resolve changes against the performance decisions above.
Run the local regression checks and syntax checks before pushing `experiments`.
The optional update notice points to the fork, so it cannot switch Fisher back
to an upstream release.
