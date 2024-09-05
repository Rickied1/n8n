# Custom Fork Changelog

This changelog tracks the modifications made in this fork of the n8n project.

## [Unreleased]

### Fixed

- Build process for @n8n/chat package on Windows environments
  - Modified the build:bundle script in packages/@n8n/chat/package.json to use cross-env
  - Added cross-env as a devDependency in packages/@n8n/chat/package.json
  - This change allows the INCLUDE_VUE environment variable to be set correctly across different operating systems

### Added

- cross-env dependency to facilitate cross-platform environment variable setting

### Changed

- Updated build process to ensure compatibility across different operating systems

### Dev Operations

- Improved build script to work consistently across Windows, macOS, and Linux

## [1.0.0] - YYYY-MM-DD

- Initial fork from n8n official repository (replace with the actual date and version you forked from)
