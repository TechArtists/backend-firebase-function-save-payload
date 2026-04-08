# Setup Scripts

## setup-project-permissions.sh

Automates IAM role, API enablement, and optionally bucket permissions for Firebase Functions deployment.

### Prerequisites

1. **gcloud CLI** installed and authenticated

   ```bash
   gcloud auth login
   ```

2. **gsutil** (comes with gcloud)

3. Owner or IAM Admin access to the target GCP project (and bucket project if different)

### Usage

```bash
./scripts/setup-project-permissions.sh <PROJECT_ID> [DEPLOY_SERVICE_ACCOUNT_EMAIL] [BUCKET_PROJECT] [BUCKET_NAME]
```

### Examples

**Setup deployment project only (recommended for initial setup):**

```bash
./scripts/setup-project-permissions.sh dietbet-staging
```

**Setup with custom deploy service account:**

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

**Stage 1: Deployment Project Permissions**

1. **Grants IAM Roles**:
   - `Firebase Admin` — Required to deploy Firebase Functions
   - `Service Account User` — Required on default compute SA to impersonate it
   - `Service Usage Consumer` — Allows Firebase CLI to enable APIs automatically
2. **Enables APIs**:
   - Cloud Functions API
   - Cloud Build API
   - Artifact Registry API
   - Cloud Run Admin API
   - Eventarc API

**Stage 2: Bucket Permissions (Optional)**

- Grants `Storage Object Admin` on the specified bucket to the compute SA
- Includes warnings/confirmations before making changes
- Falls back to manual instructions if gsutil fails

### Notes

- The script uses `firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com` by default
- If using a different deploy service account, pass it as the second argument
- API enablement may take 1-2 minutes to propagate
- Bucket permissions are **optional** — only provide if deploying immediately

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
