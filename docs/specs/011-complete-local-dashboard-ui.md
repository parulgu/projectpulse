# Spec 011: Complete Local Dashboard UI

## Goal

Complete the local React dashboard UI for the current frontend-only phase.

## User Story

As a reviewer, I want the selected project dashboard to show status lanes, actions by person, daily updates, meeting notes, and Bug DB panels so I can review the full user experience before backend work begins.

## Scope

- Add interactive dashboard tabs.
- Render Status by Project lanes from selected project actions.
- Render Actions by Person with owner filter, add action, and status updates.
- Render Daily Updates with optional action creation.
- Render Meeting Notes with mocked extraction into action items.
- Render Bug DB with local query, assignee filter, and status filter.
- Keep all data local in React state.
- Keep UI simple and work-focused.

## Out Of Scope

- Backend APIs.
- SQLite persistence.
- Real AI extraction.
- Real file upload processing.
- Real Bug DB fetching.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Dashboard tabs switch visible panels.
- Status lanes reflect the selected project's actions.
- Actions by Person can add an action and change action status.
- Daily Updates can add an update and optionally create an action.
- Meeting Notes mocked extraction adds actions to the selected project.
- Bug DB query and filters update the visible local bug list.
- Switching projects refreshes all panels to the selected project context.

