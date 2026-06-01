# Spec 004: Remove Workspace Footer

## Goal

Remove the `Workspace / Product Team` footer from the app shell sidebar.

## User Story

As a reviewer, I want the sidebar/header area to show only the essential Project Pulse identity so the dashboard starts cleaner.

## Scope

- Remove the static workspace footer from the React shell.
- Keep the Project Pulse brand visible.
- Preserve the rest of the dashboard layout from earlier specs.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The text `Workspace` no longer renders in the React app shell.
- The text `Product Team` no longer renders in the React app shell.
- The text `Project Pulse` still renders.

