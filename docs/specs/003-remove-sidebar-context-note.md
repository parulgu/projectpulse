# Spec 003: Remove Sidebar Context Note

## Goal

Remove the explanatory `View / Single project dashboard` block from the app shell header/sidebar area.

## User Story

As a reviewer, I want the header/sidebar area to be cleaner so the application starts with only essential workspace identity and navigation context.

## Scope

- Remove the static sidebar context note from the React shell.
- Keep the Project Pulse brand visible.
- Keep the workspace label visible.
- Preserve the rest of the static dashboard layout from Spec 002.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The text `Single project dashboard` no longer renders in the React app shell.
- The text `Project Pulse` still renders.
- Workspace footer visibility is covered by Spec 004.
