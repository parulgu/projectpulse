# Spec 012: Delete Project

## Goal

Let users delete the selected project from the local React prototype.

## User Story

As a reviewer, I want to delete a project with confirmation so I can manage the project list while avoiding accidental data loss.

## Scope

- Add a delete action in the selected project summary.
- Require inline confirmation before deleting.
- Remove the project from local React state.
- Remove local actions, updates, and bugs for the deleted project.
- Select another remaining project after deletion.
- Prevent deleting the final remaining project.

## Out Of Scope

- Backend persistence.
- Undo.
- Bulk delete.
- Permission checks.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Clicking `Delete Project` shows confirmation.
- Clicking `Cancel` keeps the project.
- Confirming delete removes the project from the sidebar.
- Confirming delete removes the deleted project's local actions, updates, and bugs.
- After deletion, another project is selected.
- If only one project remains, delete is disabled or blocked.

