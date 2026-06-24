AI Extraction

Requirement: Extract Actions From Notes

The system shall generate action items from project meeting notes.

Scenario: Extract actions

* WHEN extraction is requested
* THEN the backend analyzes the provided note content
* AND returns extracted action items

Scenario: Project context

* WHEN extraction is performed
* THEN the selected project’s member list is available to the extraction process

Scenario: Empty notes

* WHEN extraction is requested with no note content
* THEN no actions are generated

⸻

Requirement: OCI Generative AI Integration

The system shall use OCI Generative AI for action extraction.

Scenario: OCI configured

* WHEN valid OCI configuration is available
* THEN extraction uses OCI Generative AI

Scenario: OCI unavailable

* WHEN OCI configuration is missing
* THEN extraction fails with a clear configuration error

Scenario: OCI dependency unavailable

* WHEN OCI dependencies are not installed
* THEN the backend remains bootable
* AND extraction returns a clear setup error

⸻

Requirement: OCI Configuration

The system shall support configurable OCI settings.

Scenario: Configuration file

* WHEN OCI settings exist in the local configuration file
* THEN they are loaded automatically

Scenario: Environment override

* WHEN OCI environment variables are present
* THEN they override configuration-file values

Scenario: Custom config location

* WHEN a custom configuration path is provided
* THEN OCI settings are loaded from that location

Scenario: Missing required settings

* WHEN required OCI settings are absent
* THEN the error identifies the missing configuration values

⸻

Requirement: Structured Extraction Responses

The system shall use structured extraction results.

Scenario: Valid extraction response

* WHEN extraction succeeds
* THEN action items are returned in the expected structured format

Scenario: Non-structured response

* WHEN extraction output does not match the required format
* THEN extraction is rejected

⸻

Requirement: Robust JSON Parsing

The system shall tolerate common model response formatting.

Scenario: Raw JSON

* WHEN the model returns raw JSON
* THEN extraction succeeds

Scenario: Markdown fenced JSON

* WHEN the model wraps JSON inside markdown code fences
* THEN extraction succeeds

Scenario: Wrapped JSON response

* WHEN the model includes explanatory text around JSON
* THEN the first valid JSON object is extracted

Scenario: Invalid response

* WHEN no valid JSON object can be recovered
* THEN extraction returns a clear error

⸻

Requirement: Owner Normalization

The system shall map extracted owners to project members.

Scenario: Exact owner match

* WHEN an extracted owner matches a project member
* THEN that member becomes the action owner

Scenario: Normalized owner match

* WHEN a model returns a variation of a member name
* THEN the owner is matched to the appropriate project member

Scenario: Unknown owner

* WHEN an extracted owner does not match a project member
* THEN the action is assigned to No Owner

⸻

Requirement: Owner Inference

The system shall infer ownership when extraction omits an owner.

Scenario: Single clear member reference

* WHEN a project member is clearly referenced in the notes
* AND extraction returns no owner
* THEN that member becomes the action owner

Scenario: Ambiguous ownership

* WHEN ownership cannot be determined confidently
* THEN the action remains unassigned

⸻

Requirement: Fallback Extraction

The system shall generate useful actions when AI extraction fails.

Scenario: Empty extraction result

* WHEN the AI provider returns no usable actions
* THEN fallback extraction rules are applied

Scenario: Assignment statement

* WHEN notes contain assignment language
* THEN an action is created from the assignment

Scenario: Assignment owner

* WHEN assignment language references a project member
* THEN that member becomes the action owner

Scenario: Due-date phrase cleanup

* WHEN assignment language includes simple due-date wording
* THEN the wording is removed from the generated action title

Scenario: No fallback match

* WHEN fallback rules find no valid actions
* THEN no actions are generated

⸻

Requirement: Draft Review Workflow

The system shall require review before extracted actions are persisted.

Scenario: Draft actions returned

* WHEN extraction succeeds
* THEN actions are returned as draft actions

Scenario: Edit draft action

* WHEN a reviewer updates a draft action
* THEN the modified version becomes the candidate action

Scenario: Remove draft action

* WHEN a reviewer removes a draft action
* THEN it is excluded from persistence

Scenario: Add draft action

* WHEN a reviewer creates a new draft action
* THEN it becomes part of the reviewed action set

Scenario: Confirm reviewed actions

* WHEN reviewed actions are confirmed
* THEN they are persisted

Scenario: Cancel review

* WHEN reviewed actions are not confirmed
* THEN no actions are persisted

⸻

Requirement: Meeting Context Preservation

The system shall preserve extraction context.

Scenario: Meeting date available

* WHEN extraction occurs with a selected meeting date
* THEN extracted actions retain that meeting date

Scenario: Meeting source tracking

* WHEN actions are generated from notes
* THEN the extraction source remains associated with the resulting actions

⸻

Requirement: Extraction Reliability

The system shall provide deterministic extraction behavior.

Scenario: Successful extraction

* WHEN extraction completes successfully
* THEN actions are returned consistently

Scenario: Configuration error

* WHEN extraction cannot run due to setup issues
* THEN a configuration error is returned

Scenario: Provider error

* WHEN the AI provider fails
* THEN a clear extraction error is returned

Scenario: No actions found

* WHEN extraction succeeds but produces no actions
* THEN a valid no-actions result is returned