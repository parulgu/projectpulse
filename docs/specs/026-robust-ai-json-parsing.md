# Spec 026: Robust AI JSON Parsing

## Goal

Make OCI GenAI extraction tolerate common model formatting around the required JSON response.

## User Story

As a user, I want action extraction to work even when the model wraps the JSON in markdown or explanatory text.

## Scope

- Keep the required extraction contract as a JSON object.
- Parse raw JSON responses.
- Parse JSON wrapped in markdown fences.
- Recover the first JSON object from a response with leading or trailing text.
- Strengthen the OCI prompt so the model returns only JSON.

## Out Of Scope

- Storing raw model responses.
- Building a full JSON repair pipeline for malformed partial objects.
- Changing the frontend extraction flow.

## Acceptance Criteria

- Wrapped JSON responses are accepted.
- Non-object JSON responses are rejected.
- Completely invalid responses still return a clear extraction error.
- Backend tests cover wrapped JSON parsing.
