# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-01-08

### Added
- **Ref Validation**: Added `_validateRef()` method in `GitGraphAdapter` to prevent command injection attacks
- **Production Files**: Added LICENSE, NOTICE, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
- **CI Pipeline**: GitHub Actions workflow for linting and testing
- **Enhanced README**: Comprehensive API documentation, validation rules, performance characteristics, and architecture diagrams
- **npm Metadata**: Full repository URLs, keywords, engines specification, and files array

### Changed
- **Dependency Management**: Switched from `file:../plumbing` to npm version `@git-stunts/plumbing: ^2.7.0`
- **Description**: Enhanced package description with feature highlights
- **Delimiter**: Confirmed use of ASCII Record Separator (`\x1E`) for robust parsing

### Security
- **Ref Pattern Validation**: All refs validated against `/^[a-zA-Z0-9_/-]+(\^|\~|\.\.|\.)*$/`
- **Injection Prevention**: Refs cannot start with `-` or `--` to prevent option injection
- **Command Whitelisting**: Only safe Git plumbing commands permitted through adapter layer

## [2.0.0] - 2026-01-07

### Added
- **Roaring Bitmap Indexing**: Implemented a sharded index architecture inspired by `git-mind` for O(1) graph lookups.
- **CacheRebuildService**: New service to scan Git history and build/persist the bitmap index as a Git Tree.
- **Streaming Log Parser**: Refactored `listNodes` to use async generators (`iterateNodes`), supporting graphs with millions of nodes without OOM.
- **Docker-Only Safety**: Integrated `pretest` guards to prevent accidental host execution.
- **Performance Benchmarks**: Added a comprehensive benchmark suite and D3.js visualization.

### Changed
- **Hexagonal Architecture**: Full refactor into domain entities and infrastructure adapters.
- **Local Linking**: Switched to `file:../plumbing` for explicit local-first development.
- **Delimiter Hardening**: Moved to a Null Byte separator for robust `git log` parsing.

## [1.0.0] - 2025-10-15

### Added
- Initial release with basic "Empty Tree" commit support.
