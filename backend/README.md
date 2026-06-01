# Project Pulse Backend

This is the first local backend for Project Pulse. It uses Python's standard HTTP server plus SQLite, so it can run without installing new packages.

AI extraction uses OCI Generative AI through LangChain. Install the optional backend AI dependencies before using `Extract Actions`:

```bash
python3 -m pip install -r backend/requirements.txt
```

## Run

```bash
python3 backend/app.py
```

The API starts at:

```text
http://127.0.0.1:8000
```

The default SQLite database is created at:

```text
backend/project_pulse.db
```

The default server starts with no demo projects. Tests can opt into seeded demo data with `make_server(..., seed=True)`.

## Endpoints

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/projects`
- `POST /api/projects`
- `DELETE /api/projects/{projectId}`
- `GET /api/projects/{projectId}/dashboard`
- `POST /api/projects/{projectId}/members`
- `POST /api/projects/{projectId}/extract-actions`
- `POST /api/actions`
- `PATCH /api/actions/{actionId}`
- `DELETE /api/actions/{actionId}`
- `POST /api/updates`
- `POST /api/projects/{projectId}/bugs/refresh`

## AI Extraction

`POST /api/projects/{projectId}/extract-actions` calls OCI Generative AI through LangChain `ChatOCIGenAI`.

Edit the local backend config file:

```text
backend/project-pulse.config.json
```

Use this shape:

```json
{
  "oci": {
    "compartmentId": "ocid1.compartment.oc1.....",
    "serviceEndpoint": "https://inference.generativeai.<region>.oci.oraclecloud.com",
    "modelId": "meta.llama-3.3-70b-instruct",
    "authType": "API_KEY",
    "authProfile": "DEFAULT"
  }
}
```

Environment variables can still override the file:

```bash
export OCI_GENAI_COMPARTMENT_ID="ocid1.compartment.oc1....."
export OCI_GENAI_SERVICE_ENDPOINT="https://inference.generativeai.<region>.oci.oraclecloud.com"
export OCI_GENAI_MODEL_ID="meta.llama-3.3-70b-instruct"
export OCI_GENAI_AUTH_TYPE="API_KEY"
export OCI_GENAI_AUTH_PROFILE="DEFAULT"
```

Set `PROJECT_PULSE_CONFIG_PATH` if you want to use a different config path. For local API key auth, the OCI SDK reads credentials from `~/.oci/config`. You can also use the `PROJECT_PULSE_OCI_*` equivalents of the variables above.

Without OCI config or dependencies, the endpoint returns a clear setup error and does not create mock actions.

## Test

```bash
python3 -m unittest discover backend/tests
```
