# Spec 036: Due Date Indicators And Action Delete Confirmation

## Goal

Make action follow-up easier to scan and safer to delete.

## User Story

As a project owner, I want clear due-date signals and a confirmation before deleting actions so I can manage work without accidental data loss.

## Scope

- Show compact due-date indicators when an action has a completion date.
- Mark due dates as overdue, due today, due tomorrow, due soon, later, or done.
- Keep the date picker unchanged.
- Replace instant action deletion with a confirmation popup.
- Delete the action only after the user confirms.

## Out Of Scope

- Calendar reminders.
- Actual completion timestamps.
- Bulk delete confirmation.

## Acceptance Criteria

- Actions with completion dates show a compact due-date badge.
- Overdue active or blocked actions are visually distinct.
- Actions without completion dates do not show extra text.
- Clicking an action delete icon opens a confirmation popup.
- Canceling the popup leaves the action unchanged.
- Confirming the popup deletes the action.
