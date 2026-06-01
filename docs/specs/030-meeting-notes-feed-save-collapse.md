# Spec 030: Meeting Notes Feed Save Collapse

## Goal

Save extracted meeting notes into the project notes feed and keep that feed below the notes workspace in a collapsed state by default.

## User Story

As a user, I want notes and AI companion inputs that I extract from to be preserved in the project notes feed, but I do not want the feed taking over the Meeting Notes screen unless I expand it.

## Scope

- Save the current notes text to the project notes feed after successful extraction.
- Keep extracted actions creation unchanged.
- Move the project notes feed below the notes and extraction preview area.
- Make the feed collapsible.
- Collapse the feed by default and when switching projects.

## Out Of Scope

- Editing or deleting feed entries.
- Saving notes before extraction succeeds.
- Creating a separate rich meeting-summary entity.

## Acceptance Criteria

- Successful extraction adds the note text to the project notes feed.
- The feed appears below the Notes and AI inputs area.
- The feed is collapsed by default.
- Expanding the feed shows saved note/update entries.
