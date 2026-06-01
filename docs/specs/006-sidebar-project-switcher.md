# Spec 006: Sidebar Project Switcher

## Goal

Move the project switching controls from the main canvas into the left side panel.

## User Story

As a reviewer, I want classification and project selection to live in the left panel so the main dashboard canvas stays focused on the selected project's status and work.

## Scope

- Move classification buttons into the sidebar.
- Move the project dropdown into the sidebar.
- Keep selection state in `App`.
- Refresh the main canvas when classification or project changes.
- Keep the selected project summary and metrics in the main canvas.

## Out Of Scope

- Status lanes.
- Actions by person.
- Project creation.
- Member management.
- Backend integration.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Sidebar renders `Project Pulse`.
- Sidebar renders classification controls.
- Sidebar renders the project dropdown.
- The main canvas no longer renders the old classification/project switcher section.
- Selecting `Personal` refreshes the main canvas to `Home Renovation`.
- Selecting `Analytics Migration` refreshes the main canvas metrics to `0 / 1 / 0`.

