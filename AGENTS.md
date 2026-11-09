# AGENTS.md

* work in English

## Local validation

* Run `node scripts/test-performance.cjs` for isolated regression checks.
* Run `fish --no-config -n <file>` on changed Fish files.
* Use local tools for validation. Do not use Docker for this fork.
* Ignore inherited Docker build and CI instructions. Keep those files and
  references in place; removing them is not part of local maintenance.
* Before changing startup, Git rendering, or update behavior, read
  [docs/local-performance.md](docs/local-performance.md) for the fork's decisions,
  optional async integration check, profiling, and failure log location.

## Code style

* Fish shell language ;
* KISS principles ;
* Avoid external dependencies where possible
* use commit conventions to generate changelogs and releases
* write tests for new features and bug fixes
* use [clean code principles](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29#file-clean_code-md)
* follow [Pure code style guide](./CONTRIBUTING.md)

## Documentation

* when adding new features, update the documentation accordingly ;
* Generate concise and simple echo outputs to provide execution status
* document all public functions with `--description` ;
* when applicable, ask me if you need to add screenshots generation in `tools/screenshot.fish`. If so, add the screenshots to the documentation;
