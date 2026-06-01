# Spec 016: Bug DB URL Tab

## Goal

Remove Bug DB free-text search and add a URL view where the user can provide a bug query URL.

## User Story

As a reviewer, I want Bug DB to capture the source query URL instead of using a prototype-only search box.

## Scope

- Remove the Bug DB search input.
- Keep Assigned and Status filters for the local bug list.
- Add an internal `URL` tab inside Bug DB.
- Allow the user to enter and save a Bug DB query URL.
- Show the saved URL in the Bug DB URL view.

## Out Of Scope

- Fetching bugs from the URL.
- Backend persistence.
- Authentication or real Bug DB integration.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Bug DB no longer shows a `Search` field.
- Bug DB has a `URL` tab.
- The `URL` tab has an input for the Bug DB query URL.
- Saving a URL displays the saved URL.
- The local bug list still supports Assigned and Status filters.
