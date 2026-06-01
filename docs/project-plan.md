# Project Pulse Project Plan

## Product Vision

Project Pulse helps teams track daily project progress in one place. It connects project status, action items, meeting notes, latest updates, and bug signals so that everyone can see what is active, blocked, and completed.

## Core Users

- Project owner: creates projects, reviews progress, follows up on blockers.
- Team member: contributes meeting notes or latest updates, owns action items, checks off completed work.
- Viewer: reviews project status, bugs, meeting outcomes, and action progress.

## Core Modules

### Projects

- Create multiple projects.
- Assign a user-defined classification such as Work, Personal, Customer, Internal, or any other category.
- Add project members during project creation or later from the dashboard.
- Select a project as the current dashboard context.

### Dashboard

- Show status summary for the selected project.
- Show Active, Blocked, and Done status lanes by project.
- Show action checklist by person with editable action status.
- Keep all dashboard sections scoped to the selected project.

### Meeting Notes

- Capture notes inside the selected project context.
- Show latest project updates in the Meeting Notes view.
- Extract important points and action items from notes through the backend OCI GenAI endpoint when configured.
- Add extracted actions directly to actions by person and status lanes.
- Show a clear setup error when AI is not configured.

### Uploads

- Upload AI companion notes as text into the Meeting Notes area.
- Keep meeting video upload out of the current UI.

### Bug DB

- Show bugs linked to the selected project.
- Load project-scoped Bug DB data from uploaded Excel reports, with backend URL refresh planned later.
- Run a simple Bug DB query against project-linked bugs.
- Filter by assignee and status.
- Show a compact summary: total, open, in progress, high risk.

## MVP Scope

- Single dashboard UI.
- Project creation with custom classification.
- Project member management.
- Project-scoped Active, Blocked, and Done status lanes.
- Project-scoped action checklist with status changes.
- Meeting Notes view with latest updates and AI action extraction.
- Meeting notes that create AI-extracted action items when configured.
- Bug DB sample data, URL fetch, query, and filters.

## Later Scope

- Real meeting video transcription and summarization.
- Real Bug DB integration.
- User authentication and project permissions.
- Reports and historical trends.
