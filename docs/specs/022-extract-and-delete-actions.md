# Spec 022: Extract And Delete Actions

## Goal

Fix the Meeting Notes extraction flow and add action item deletion.

## User Story

As a user, I want extracted actions to clearly appear in the project action list, and I want to remove action items that are no longer needed.

## Scope

- Make `Extract Actions` show loading, success, and error feedback.
- Ensure extracted actions are persisted through the backend.
- Add backend support for deleting an action item.
- Add small delete controls to action cards and action rows.
- Remove deleted actions from the UI immediately after a successful backend delete.

## Out Of Scope

- Real AI extraction.
- Bulk action deletion.
- Undo.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Backend tests pass.
- `Extract Actions` creates persisted action items.
- Failed extraction shows an error in Meeting Notes.
- Action items can be deleted from the status board.
- Action items can be deleted from Actions by Person.
- Deleted actions remain deleted after browser reload.
