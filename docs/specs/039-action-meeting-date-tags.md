# Spec 039: Action Meeting Date Tags

## User Story

As a project reviewer, I want extracted actions to show which meeting date they came from so I can filter follow-ups by the meeting summary that produced them.

## Acceptance Criteria

- Actions created by Meeting Notes extraction store the selected meeting date.
- Extracted action previews and action rows show a compact meeting-date tag when available.
- Status by Project can filter action lanes by meeting date.
- Status by Person can filter action rows by meeting date.
- Manual actions without a meeting date remain visible when the filter is set to All.
