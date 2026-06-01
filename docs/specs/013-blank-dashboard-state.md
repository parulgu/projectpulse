# Spec 013: Blank Dashboard State

## Goal

Allow users to delete every project and return to a blank dashboard state.

## User Story

As a reviewer, I want to delete all projects so I can start over with an empty local workspace.

## Scope

- Allow deleting the final remaining project.
- Clear selected project when no projects remain.
- Render an empty dashboard state when no project is selected.
- Keep the sidebar usable so a new project can be created from the blank state.
- Reset project-scoped actions, updates, and bugs for deleted projects.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Deleting the last project is allowed after confirmation.
- After deleting the last project, the sidebar project list is empty.
- After deleting the last project, the main canvas shows a blank dashboard state.
- Metrics and project-specific tabs do not render stale deleted project data.
- Creating a new project from the blank state selects it and restores the dashboard.

