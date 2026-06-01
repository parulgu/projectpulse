# Spec 028: Simple Assignment Extraction Fallback

## Goal

Create usable action items from simple assignment notes even when the AI provider returns no usable actions.

## User Story

As a user, I want notes like `AA need to complete UI by today` to create an action for AA instead of failing with an empty AI result.

## Scope

- Detect clear `member needs to do X` style assignment language.
- Infer the action owner from existing project members.
- Remove simple due-date phrases such as `by today` from the action title.
- Use the fallback only when the AI output is empty or invalid JSON.

## Out Of Scope

- Full natural-language parsing.
- Due-date persistence.
- Creating new users from unknown names.

## Acceptance Criteria

- `AA need to complete UI by today` creates `Complete UI` for owner `AA` when `AA` is a project member.
- The normal AI extraction path remains the first attempt.
- Backend tests cover the fallback path.
