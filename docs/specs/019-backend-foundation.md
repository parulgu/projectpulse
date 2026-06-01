# Spec 019: Backend Foundation

## Goal

Add the first backend service for Project Pulse with persistent SQLite storage and JSON APIs that match the current React data model.

## User Story

As a builder, I want a backend API that stores projects, members, actions, daily updates, and bugs so the frontend can move away from in-memory React state.

## Scope

- Add a Python backend service under `backend/`.
- Use SQLite for local persistence.
- Provide CORS-enabled JSON endpoints for local frontend development.
- Seed the backend with the same demo data as the frontend.
- Add endpoints for:
  - Health check.
  - Bootstrap data.
  - Project list and project creation.
  - Project member creation.
  - Project deletion.
  - Action creation and status updates.
  - Daily update creation with optional action creation.
  - Project-scoped bug refresh from parsed JSON records.
- Add backend tests that exercise the API.

## Out Of Scope

- Frontend API integration.
- Authentication.
- Real Bug DB authentication or proxying.
- Real AI extraction.

## Acceptance Criteria

- Backend can run locally with `python3 backend/app.py`.
- `GET /api/health` returns an ok status.
- `GET /api/bootstrap` returns projects, actions, updates, and bugs.
- Created projects persist in SQLite.
- Deleting a project also deletes its actions, updates, members, and bugs.
- Bug refresh replaces only the selected project's bugs.
- Backend tests pass with Python's standard `unittest`.
