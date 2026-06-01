# Spec 025: OCI Config File

## Goal

Let the backend read OCI GenAI settings from a local config file instead of requiring shell exports for every run.

## User Story

As a builder, I want to edit one backend config file for OCI GenAI settings so I can restart Project Pulse without retyping environment variables.

## Scope

- Add a local `backend/project-pulse.config.json` file.
- Read OCI compartment, endpoint, model, auth type, and auth profile from the config file.
- Keep environment variables as overrides for hosted or scripted runs.
- Allow a custom config path through `PROJECT_PULSE_CONFIG_PATH`.
- Keep missing config errors clear in the UI/API.

## Out Of Scope

- Storing OCI private keys inside Project Pulse config.
- Editing config from the frontend.
- Validating OCI credentials before extraction is requested.

## Acceptance Criteria

- Backend reads OCI settings from `backend/project-pulse.config.json`.
- Backend can read the same settings from env vars when present.
- Missing compartment or endpoint produces a setup error that names the missing keys.
- Backend tests cover config-file loading.
