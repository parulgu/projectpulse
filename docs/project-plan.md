# Project Pulse Project Plan

## Product Vision

Project Pulse helps teams keep project state, meeting notes, decisions, milestones, actions, and bug signals in one working surface so people can see what is active, blocked, at risk, and done without piecing it together by hand.

## Core Users

- Project owner: creates projects, maintains overview details, reviews milestones, tracks follow-ups, and asks for summaries.
- Team member: contributes notes, confirms extracted actions, updates action ownership and dates, and records decisions.
- Viewer: reviews project status, milestones, bugs, decisions, and executive summaries.

## Core Modules

### Projects

- Create multiple projects.
- Assign user-defined classifications such as Work, Personal, Customer, Internal, or any other category.
- Store project summary details, role details, target release, and optional epic context.
- Add and edit project members from the dashboard.
- Archive projects and optionally show archived projects in navigation.
- Select either a single project or an All Projects view.

### Dashboard

- Show active, blocked, and done counts for the selected project.
- Show Status by Project lanes with editable actions.
- Show Status by Person with owner, status, overdue, and meeting-date filtering.
- Keep project sections scoped to the selected project while supporting an All Projects navigation mode.

### Meeting Notes And Memory

- Capture notes inside the selected project context.
- Save project notes with meeting dates.
- Review extracted draft actions before persisting them.
- Track decisions and blockers from meeting conversations.
- Ask project-memory questions across notes, decisions, actions, and milestones.
- Generate executive summaries when AI is configured, with local fallbacks when needed.

### Milestones And Links

- Track project phases and nested subtype or checklist items.
- Reorder, edit, complete, and remove phase items as project plans change.
- Keep a useful-links list in the project overview for quick access to project resources.

### Bug DB

- Show bugs linked to the selected project.
- Load project-scoped Bug DB data from uploaded Excel or CSV reports.
- Refresh project-scoped bug data from backend URL and helper-based queries.
- Save reusable bug queries per project.
- Filter bug data and control which uploaded columns are visible.

## Current Scope

- Single local dashboard with persisted SQLite data.
- Project creation, editing, member management, and archiving.
- Project-scoped actions with dates, filters, bulk delete, and review-before-save extraction.
- Meeting Notes, decision log, project memory, and executive summary flows.
- Project milestone phases and useful links.
- Bug DB upload, saved queries, refresh, filters, and flexible report columns.

## Later Scope

- Real meeting video transcription and summarization.
- User authentication and project permissions.
- Hosted deployment and production AI key management.
- Broader reporting and historical trend views across projects.
