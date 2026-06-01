# Spec 017: Bug DB Refresh

## Goal

Use the Bug DB query URL as the source for refreshing bugs without persisting bug records locally.

## User Story

As a reviewer, I want to provide a Bug DB query URL and refresh the project bug list from that URL so the dashboard reflects the latest query results.

## Scope

- Add a `Refresh Bugs` action to the Bug DB URL view.
- Fetch JSON from the configured query URL.
- Replace only the selected project's in-memory bug list with the fetched bugs.
- Show refresh progress, success time, and fetch or parsing errors.
- Keep the existing demo bugs as initial runtime data only.

## Out Of Scope

- Saving bugs to local storage.
- Backend proxy or authentication.
- Scheduled auto refresh.
- Non-JSON response parsing.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Bug DB URL view has a `Refresh Bugs` button.
- Refresh is disabled until a URL is available.
- A successful refresh replaces the selected project's visible bug list.
- Refresh errors are shown in the URL view.
- Bug records are kept in memory only and are not persisted locally.
