# Spec 027: Action Owner Editing And Inference

## Goal

Let users correct action ownership after creation and improve extracted action ownership before actions are saved.

## User Story

As a project owner, I want to change the owner for any action item and have extracted actions map to real project members so actions are grouped correctly by person.

## Scope

- Add owner selectors to action cards and action rows.
- Persist owner changes through the existing action PATCH endpoint.
- Normalize AI-provided owners against project members.
- Infer an action owner from meeting notes when the model leaves the owner blank but one project member is clearly mentioned.

## Out Of Scope

- Editing action titles inline.
- Multi-owner action items.
- Automatic creation of new project members from extracted notes.

## Acceptance Criteria

- A user can change an action owner to a project member or `No owner`.
- Owner changes update the local dashboard without a full page refresh.
- Extracted action owners are matched to existing project members.
- If notes clearly mention one project member and the model returns no owner, the backend assigns that member.
- Backend tests cover PATCH owner updates and owner inference.
