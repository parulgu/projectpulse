# Spec 033: Action Title Editing

## Goal

Let users correct action item titles from the dashboard without deleting and recreating actions.

## User Story

As a project owner, I want a small edit control on action items so I can fix wording after extraction or manual entry.

## Scope

- Add a compact edit icon next to the delete icon for each action.
- Support inline editing on status cards and person checklist rows.
- Persist edited titles through the existing action PATCH endpoint.
- Keep existing owner, completion date, status, and delete controls unchanged.

## Out Of Scope

- Rich text action descriptions.
- Bulk action editing.
- Action edit history.

## Acceptance Criteria

- Each action item shows an edit icon next to the delete icon.
- Clicking edit opens a compact title input with save and cancel icon buttons.
- Saving updates the action title without a page reload.
- Updated titles persist after reload.
- Empty action titles are rejected.
