# Spec 018: Bug DB Header Refresh Controls

## Goal

Simplify Bug DB controls by placing the query URL and refresh action in the Bug DB dashboard header.

## User Story

As a reviewer, I want the Bug DB screen to show the query URL and refresh action directly in the dashboard header, without extra internal tabs.

## Scope

- Remove the internal `Bugs` / `URL` tabs from Bug DB.
- Replace the `Project dashboard / Bug DB` header block with a Bug DB query URL input.
- Add a compact refresh button next to the URL input.
- Keep refreshed bugs in memory only.
- Keep Assigned and Status filters in the Bug DB list.

## Out Of Scope

- Local bug persistence.
- Backend Bug DB proxy.
- Automatic scheduled refresh.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Bug DB does not show internal `Bugs` / `URL` tabs.
- The Bug DB tab does not show the `Project dashboard` eyebrow or `Bug DB` title block.
- The top of the Bug DB tab shows a Bug DB URL input and refresh button.
- Refresh still replaces the selected project's in-memory bug list from JSON.
