# Spec 020: Frontend Backend Wiring

## Goal

Wire the React frontend to the local SQLite backend so Project Pulse works as an end-to-end local app.

## User Story

As a user, I want projects, members, actions, updates, and bugs to be served by the backend instead of resetting inside React memory.

## Scope

- Load initial frontend data from `GET /api/bootstrap`.
- Create projects through `POST /api/projects`.
- Add project members through `POST /api/projects/{projectId}/members`.
- Delete projects through `DELETE /api/projects/{projectId}`.
- Create actions through `POST /api/actions`.
- Move actions through `PATCH /api/actions/{actionId}`.
- Create daily updates through `POST /api/updates`.
- Send Bug DB refresh payloads through `POST /api/projects/{projectId}/bugs/refresh`.
- Show loading and API error states.

## Out Of Scope

- Authentication.
- Hosted deployment.
- Backend-proxied Bug DB URL fetching.
- Real AI extraction endpoints.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Frontend loads projects, actions, updates, and bugs from the backend.
- Creating a project persists in SQLite and remains after browser reload.
- Deleting a project removes it from SQLite and remains deleted after browser reload.
- Action status changes persist after browser reload.
- Daily updates persist after browser reload.
- Bug refresh stores refreshed project bugs in SQLite.
