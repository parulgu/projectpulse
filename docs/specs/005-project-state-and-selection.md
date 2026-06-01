# Spec 005: Project State And Selection

## Goal

Introduce local React state for project selection so the dashboard context and summary metrics update from data.

## User Story

As a reviewer, I want to switch between project classifications and projects so I can confirm the dashboard shell is becoming data-driven before deeper workflows are added.

## Scope

- Store sample projects and action items as frontend data constants.
- Track selected classification in React state.
- Track selected project in React state.
- Render classification buttons from project data.
- Render the project dropdown from projects in the selected classification.
- Update the selected project card when the selected classification or project changes.
- Calculate Active, Blocked, and Done metrics from action items for the selected project.

## Out Of Scope

- Creating new projects.
- Adding project members.
- Rendering status lanes.
- Rendering actions by person.
- Daily updates.
- Meeting notes.
- Bug DB.
- Backend integration or persistence.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The React app renders classification controls from project data.
- Selecting `Personal` shows `Home Renovation`.
- Selecting `Work` shows a work project.
- Changing the project dropdown updates the selected project card.
- Summary metrics are scoped to the selected project.
- There is no direct DOM manipulation.

## Review Checklist

- State should live near the app shell and flow into child components through props.
- Derived values such as visible projects and metrics should come from project/action data, not hard-coded display values.
- The implementation should still be local-only and easy to replace with API data later.

