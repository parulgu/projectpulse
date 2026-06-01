# Spec 037: Usability Polish Pass

## Goal

Reduce cognitive load and make common project review workflows safer and clearer.

## User Story

As a reviewer, I want clear feedback, safer edits, useful filters, and cleaner rows so Project Pulse feels reliable during daily project review.

## Scope

- Show Meeting Notes extraction status for saving, extracting, and no-action outcomes.
- Sort Status by Person actions by completion date, then status, then title.
- Add a warning when member edits will clear existing action owners.
- Hide action edit/delete controls until row/card hover or keyboard focus.
- Add an Overdue quick filter in Status by Person.
- Improve empty-state guidance for actions, notes, and bugs.
- Move Bug DB URL fetching from the browser into the backend.

## Out Of Scope

- Persistent user filter preferences.
- Calendar reminders.
- Authenticated production Bug DB integration.

## Acceptance Criteria

- Meeting Notes can show `Note saved`, `Extracting`, and `No actions found`.
- Status by Person lists due actions before undated actions.
- Removed project members warn when existing actions will become `No owner`.
- Action edit/delete controls appear on hover or focus.
- Overdue filter narrows the person checklist to overdue actions.
- Empty tabs explain the next useful action.
- Bug DB URL refresh calls a backend endpoint instead of fetching the URL directly in the browser.
