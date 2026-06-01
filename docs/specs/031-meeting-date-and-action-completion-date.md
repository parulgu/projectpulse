# Spec 031: Meeting Date And Action Completion Date

## Goal

Capture when a meeting happened in the project notes feed and let users set a completion date for each action item.

## User Story

As a project owner, I want saved meeting notes to show the meeting date and action items to carry a target completion date so project follow-up is easier to review.

## Scope

- Add a meeting date field to Meeting Notes before extraction.
- Persist the meeting date with the saved project notes feed entry.
- Show the meeting date on project notes feed cards.
- Add a completion date field when creating an action manually.
- Let users update or clear completion dates from status cards and person checklist rows.
- Persist action completion dates in SQLite.

## Out Of Scope

- Calendar reminders.
- Recurring action dates.
- Date-based sorting or overdue alerts.

## Acceptance Criteria

- Extracting actions from notes also saves the note with the selected meeting date.
- Meeting notes are still saved when AI extraction returns no usable action items.
- Expanded project notes feed cards show `Meeting on <date>` when a meeting date exists.
- A manually created action can include a completion date.
- Existing actions can have completion dates updated or cleared without reloading the page.
- Completion dates persist after backend restart or browser reload.
- Backend tests cover meeting date and completion date persistence.
