# Setup Scripts

## setup-project-permissions.sh

Automates IAM role, API enablement, and optionally bucket permissions for Firebase Functions deployment.

### Prerequisites

1. **gcloud CLI** installed and authenticated

   ```bash
   gcloud auth login
   ```

2. **gsutil** (comes with gcloud)

3. Permission to enable APIs and manage IAM in:
   - the target Firebase project
   - the project that owns the deployment service account
   - the bucket project, when it is different

### Usage

```bash
./scripts/setup-project-permissions.sh <PROJECT_ID> [DEPLOY_SERVICE_ACCOUNT_EMAIL] [BUCKET_PROJECT] [BUCKET_NAME]
```

### Examples

**Setup using the default AppEx deployment service account:**

```bash
./scripts/setup-project-permissions.sh dietbet-staging
```

**Setup with your own deployment service account (recommended outside AppEx):**

```bash
./scripts/setup-project-permissions.sh fitnessai-api firebase-function-deploy@my-other-project.iam.gserviceaccount.com
```

**Setup deployment project AND grant bucket permissions:**

```bash
./scripts/setup-project-permissions.sh dietbet-staging firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com appex-data-imports appex_app_payloads
```

**Setup production project with bucket permissions:**

```bash
./scripts/setup-project-permissions.sh dietbet-5771b firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com appex-data-imports appex_app_payloads
```

### What It Does

**Stage 1: Deployment Identity Project APIs**

The script derives the service account's owning project from its email and enables:

- Cloud Resource Manager API
- Firebase Management API
- Service Usage API
- Identity and Access Management API

Firebase CLI makes control-plane requests using the deployment identity. These APIs must therefore be enabled in the service account's project even when the function is deployed somewhere else. Missing APIs produce errors such as:

```text
Cloud Resource Manager API has not been used in project <NUMBER> before or it is disabled
Firebase Management API has not been used in project <NUMBER> before or it is disabled
```

**Stage 2: Target Firebase Project Permissions**

1. **Enables APIs**:
   - Cloud Functions API
   - Cloud Build API
   - Artifact Registry API
   - Cloud Run Admin API
   - Eventarc API
   - Firebase Management API
   - Identity and Access Management API
2. **Grants IAM Roles**:
   - `Firebase Admin` — Required to deploy Firebase Functions
   - `Service Account User` on the **default compute SA** (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) — Gen 2 Cloud Functions runtime; required to impersonate it
   - `Service Account User` on the **App Engine default SA** (`<PROJECT_ID>@appspot.gserviceaccount.com`) — required by `firebase-tools`' deploy preflight (`iam.serviceAccounts.actAs`) for any Firebase Functions deploy, even when every deployed function is Gen 2. If this binding is missing, deploy fails with `Missing permissions required for functions deploy. You must have permission iam.serviceAccounts.ActAs on service account <PROJECT_ID>@appspot.gserviceaccount.com`.
   - `Service Usage Consumer` — Allows Firebase CLI to enable APIs automatically
   - `Firebase Viewer` to the default compute SA — Allows the Gen 2 runtime identity to read required Firebase project configuration
   - `Cloud Build Builder` to the default compute SA — Allows it to run builds when it is the project's default Cloud Build identity
**Stage 3: Bucket Permissions (Optional)**

- Grants `Storage Object Admin` on the specified bucket to the compute SA
- Includes warnings/confirmations before making changes
- Falls back to manual instructions if gsutil fails

### Notes

- The default service account is AppEx-specific. Other organizations must pass their deployment service account as the second argument.
- The script derives the service account's project from an address shaped like `<NAME>@<PROJECT_ID>.iam.gserviceaccount.com`.
- API enablement may take 1-2 minutes to propagate
- Bucket permissions are **optional** — only provide if deploying immediately
- The script passes `--project` explicitly and does not change your active `gcloud` project.

### ⚠️ Important: Bucket Permissions

**When to use bucket parameters:**

- After the deployment project is fully set up
- When you're ready to grant bucket access
- **ONLY if you're certain about the bucket identity**

**When NOT to use:**

- First time setup — just configure the deployment project first
- If you're unsure which bucket to use — run without bucket parameters and verify manually first
- If the bucket is in the same project — you can still use this, but it's optional

**Manual bucket setup alternative:**
If the script fails or you prefer manual setup:

1. Go to: https://console.cloud.google.com/storage/browser/`<BUCKET_NAME>`?project=`<BUCKET_PROJECT>`
2. Permissions → Grant Access
3. Add principal: `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`
4. Role: `Storage Object Admin`
5. Save

### For Bucket Projects

If your bucket is in a different project, ensure Storage API is enabled:

https://console.cloud.google.com/apis/library/storage.googleapis.com?project=<BUCKET_PROJECT_ID>
