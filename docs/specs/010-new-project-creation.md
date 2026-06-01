# Spec 010: New Project Creation

## Goal

Let users create a new local project with a custom classification from the sidebar.

## User Story

As a reviewer, I want to add a project under an existing or new classification so I can confirm the sidebar navigation supports user-defined project groups.

## Scope

- Make `New Project` reveal a small form in the sidebar.
- Capture project name, classification, and comma-separated members.
- Add the project to local React state.
- Select the newly created project.
- Expand the new project's classification group.
- Show the new project with `0 / 0 / 0` metrics.

## Out Of Scope

- Backend persistence.
- Editing or deleting projects.
- Validation beyond requiring a project name.
- Project owner selection.
- Rich member management.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Clicking `New Project` opens a simple form.
- Creating a project with classification `Customer` adds a `Customer` group in the sidebar.
- The created project becomes selected in the main canvas.
- The created project metrics render as `0 / 0 / 0`.
- Cancelling the form hides it without creating a project.

