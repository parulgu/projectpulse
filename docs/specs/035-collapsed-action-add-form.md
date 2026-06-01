# Spec 035: Collapsed Action Add Form

## Goal

Keep the Status by Person tab simple by hiding the manual action form until the user asks to add an action.

## User Story

As a project owner, I want a compact add icon that opens the action form so the checklist stays focused on existing work.

## Scope

- Replace the always-visible add action form with an add icon.
- Open the add form when the icon is clicked.
- Use save and cancel icon buttons inside the add form.
- Keep owner, title, and completion date fields unchanged.
- Close and clear the form after save or cancel.

## Out Of Scope

- Bulk action creation.
- Action templates.
- Modal-based action creation.

## Acceptance Criteria

- Status by Person shows an add action icon instead of an always-open form.
- Clicking the icon opens the add action form.
- The add form saves with a check icon.
- The add form cancels with an X icon.
- Saving or canceling closes the form.
