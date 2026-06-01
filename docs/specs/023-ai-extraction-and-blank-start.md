# Spec 023: AI Extraction And Blank Start

## Goal

Start Project Pulse from a blank dashboard and move action extraction from frontend mock data to a backend AI extraction endpoint.

Note: Spec 024 replaces the initial OpenAI-compatible provider direction with OCI GenAI through LangChain `ChatOCIGenAI`.

## User Story

As a user, I want a blank workspace when I first open the app and I want meeting notes extraction to use an AI service instead of static hardcoded actions.

## Scope

- Disable automatic demo data seeding for the default SQLite database.
- Clear the current local SQLite data so the dashboard starts blank.
- Make the Meeting Notes text area empty by default.
- Add a backend `POST /api/projects/{projectId}/extract-actions` endpoint.
- Call a backend AI provider from the extraction endpoint when configured.
- Persist extracted action items returned by AI.
- Show a clear UI error when AI is not configured.

## Out Of Scope

- Storing AI prompts or raw model responses.
- Full meeting summary generation.
- Real file storage for uploads.
- Authentication.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Backend tests pass.
- `GET /api/bootstrap` returns no projects for the default local database after reset.
- Meeting Notes starts with an empty notes area.
- `Extract Actions` calls the backend extraction endpoint.
- The backend extraction endpoint creates actions from AI output when an AI key is configured.
- When no AI key is configured, the UI shows a clear AI configuration error instead of creating mock actions.
