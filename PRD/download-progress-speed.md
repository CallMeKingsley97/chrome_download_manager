# Download Progress & Speed PRD

## Background
The list lacks a clear progress preview and real-time speed display for in-progress downloads.

## Goals
- Show an in-card progress preview (bar + percent) for downloading items.
- Show speed and remaining time in a compact, scan-friendly layout.

## Placement & UI
- Placement: below title/status/meta, above action buttons in each downloading card.
- Progress preview: thin progress bar with a percent on the right; unknown total uses indeterminate animation.
- Speed display: pill-style info chips for speed / progress / remaining time, wrapping as needed.

## Rules
- Speed calculation uses the existing cached sampling logic.
- The setting "show downloaded size" only controls the progress (downloaded/total) pill.

## Non-goals
- No global summary panel.
- No changes to list structure or action button layout.
