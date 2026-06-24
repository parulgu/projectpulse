## 1. Data Model And Parsing

- [ ] 1.1 Define the template-based milestone phase and subtype data shape, including subtype title, owner, status, link, comments, and ordering fields.
- [ ] 1.2 Implement text template parsing for top-level phases and one indented subtype level.
- [ ] 1.3 Add validation that rejects templates with nesting deeper than one level before any project data is replaced.
- [ ] 1.4 Ensure imported subtype status defaults to `Not Started`.
- [ ] 1.5 Handle duplicate phase titles by preserving separate phase records in template order.

## 2. Backend Persistence And APIs

- [ ] 2.1 Add or update persistent storage for project-scoped template milestone phases and subtypes.
- [ ] 2.2 Implement the milestone template import API as an atomic replacement for the selected project's existing milestone data.
- [ ] 2.3 Implement subtype update support for title, owner, status, link, and comments.
- [ ] 2.4 Enforce allowed status values: `Not Started`, `In Progress`, `Blocked`, `Complete`, and `Not Applicable`.
- [ ] 2.5 Update bootstrap data to return template-based milestone phases and subtypes.
- [ ] 2.6 Remove or retire legacy phase and phase-item mutation API paths used for manual create, edit, reorder, delete, and completion tracking.

## 3. Frontend Milestones Experience

- [ ] 3.1 Replace manual phase and phase-item controls with a text template upload/import workflow in the Milestones section.
- [ ] 3.2 Render imported phases and subtypes in template order for the selected project.
- [ ] 3.3 Add editable subtype fields for owner, status, link, and comments.
- [ ] 3.4 Display subtype status in milestone views and persist status edits through the backend.
- [ ] 3.5 Show validation feedback when import fails, including additional nesting errors.
- [ ] 3.6 Ensure importing a template into a project with existing milestones replaces that project's displayed structure.

## 4. Project Memory Integration

- [ ] 4.1 Update project memory source assembly to include template-based phase names and subtype title, owner, status, link, and comments.
- [ ] 4.2 Ensure project memory questions use only the selected project's milestone data.
- [ ] 4.3 Ensure executive summaries reflect current template-based milestone information.

## 5. Tests And Validation

- [ ] 5.1 Add backend tests for valid template import, phase creation, subtype creation, default status, and persistence after reload.
- [ ] 5.2 Add backend tests for additional nesting rejection with no data replacement.
- [ ] 5.3 Add backend tests for project isolation when importing into one project while other projects have milestones.
- [ ] 5.4 Add backend tests for subtype field updates and status validation.
- [ ] 5.5 Add frontend validation for template upload, replacement display, subtype editing, and retired workflow removal.
- [ ] 5.6 Run the project test suite and fix regressions.
