# Spec 040: Reviewed Action Extraction And Bulk Delete

## User Story

As a project reviewer, I want extracted actions to be reviewed before they enter the dashboard so I can correct owners, dates, and titles before they affect project status.

## Acceptance Criteria

- Meeting Notes extraction returns draft actions without immediately adding them to the action tables.
- The reviewer can add, edit, or remove extracted draft actions before confirmation.
- Confirming reviewed actions persists them and adds them to Status by Project and Status by Person.
- Status by Person supports selecting multiple action rows and deleting them together after confirmation.
- Existing single-action edit/delete behavior continues to work.
