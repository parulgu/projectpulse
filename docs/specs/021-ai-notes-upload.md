# Spec 021: AI Companion Notes Upload

## Goal

Make AI companion notes upload work as a real text-file upload and remove the meeting video upload option.

## User Story

As a user, I want to upload AI companion notes into the meeting notes area so I can extract action items from the uploaded text.

## Scope

- Remove `Upload meeting video`.
- Replace the mock AI companion notes button with a real file input.
- Read uploaded text-like files into the Notes textarea.
- Show the uploaded file name and upload errors.
- Keep action extraction as the existing mock extraction step from the notes text.

## Out Of Scope

- Video upload.
- Video transcription.
- Backend file storage.
- Real AI extraction.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Meeting Notes no longer shows `Upload meeting video`.
- `Upload AI companion notes` is backed by an `<input type="file">`.
- Uploading a text-like file populates the notes textarea.
- The extraction button can still create action items from the current notes.
