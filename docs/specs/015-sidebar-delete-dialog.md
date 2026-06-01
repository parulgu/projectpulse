# Spec 015: Sidebar Delete Dialog

## Goal

Move project deletion into the sidebar project list and confirm destructive deletion in a popup dialog.

## User Story

As a reviewer, I want to delete a project directly from the project list while getting a clear confirmation popup before data is removed.

## Scope

- Add a small delete icon button next to each project name in the sidebar.
- Remove project deletion from the selected project summary header.
- Replace inline delete confirmation with a modal dialog.
- Allow deleting any project from the sidebar, including non-selected projects.
- Keep blank dashboard behavior when all projects are deleted.

## Out Of Scope

- Backend persistence.
- Undo after delete.
- Bulk project deletion.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Each sidebar project row has a compact delete icon button next to the project name.
- Clicking a sidebar delete button opens a confirmation popup.
- Cancelling closes the popup without deleting.
- Confirming deletes the chosen project and related local actions, updates, and bugs.
- Deleting the selected project selects the next available project or shows the blank dashboard if none remain.
- The selected project summary no longer shows a project delete menu or inline delete confirmation.
