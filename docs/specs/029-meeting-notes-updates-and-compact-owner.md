# Spec 029: Meeting Notes Updates And Compact Owner

## Goal

Remove the standalone Daily Updates tab and keep latest project updates visible in Meeting Notes while making action owner controls more compact.

## User Story

As a user, I want meeting notes to be the place where updates are reviewed and action items are extracted, without a separate Daily Updates tab. I also want owner selectors to fit naturally inside action cards and rows.

## Scope

- Remove `Daily Updates` from dashboard tab navigation.
- Show latest project updates inside the Meeting Notes tab.
- Keep existing backend update data readable.
- Reduce the visual footprint of per-action owner dropdowns.

## Out Of Scope

- Removing backend update APIs or database tables.
- Reworking update creation into a new meeting-summary form.
- Adding due-date persistence.

## Acceptance Criteria

- The dashboard tab list does not include `Daily Updates`.
- Meeting Notes shows a latest-updates feed.
- Owner dropdowns are visually compact in both status cards and person rows.
- Frontend build succeeds.
