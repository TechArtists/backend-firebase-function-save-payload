#!/bin/bash

# Setup Firebase Function Deploy Permissions
# Usage: ./setup-project-permissions.sh <PROJECT_ID> <DEPLOY_SERVICE_ACCOUNT_EMAIL> [BUCKET_PROJECT] [BUCKET_NAME]
# Example: ./setup-project-permissions.sh example-app-prod firebase-function-deploy@deployment-infra.iam.gserviceaccount.com central-storage app_payloads

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ] || [ -z "$2" ]; then
  echo -e "${RED}Error: PROJECT_ID and DEPLOY_SERVICE_ACCOUNT_EMAIL are required${NC}"
  echo "Usage: $0 <PROJECT_ID> <DEPLOY_SERVICE_ACCOUNT_EMAIL> [BUCKET_PROJECT] [BUCKET_NAME]"
  echo "Example: $0 example-app-prod firebase-function-deploy@deployment-infra.iam.gserviceaccount.com central-storage app_payloads"
  exit 1
fi

PROJECT_ID="$1"
DEPLOY_SA="$2"
BUCKET_PROJECT="$3"
BUCKET_NAME="$4"

if [[ "$DEPLOY_SA" != *@*.iam.gserviceaccount.com ]]; then
  echo -e "${RED}Error: DEPLOY_SERVICE_ACCOUNT_EMAIL is not a Google service account email${NC}"
  exit 1
fi

if { [ -n "$BUCKET_PROJECT" ] && [ -z "$BUCKET_NAME" ]; } || \
   { [ -z "$BUCKET_PROJECT" ] && [ -n "$BUCKET_NAME" ]; }; then
  echo -e "${RED}Error: BUCKET_PROJECT and BUCKET_NAME must be provided together${NC}"
  exit 1
fi

# Firebase CLI requests are billed to the project that owns the deploy service
# account, so its control-plane APIs must be enabled in addition to target APIs.
DEPLOY_SA_PROJECT="${DEPLOY_SA#*@}"
DEPLOY_SA_PROJECT="${DEPLOY_SA_PROJECT%.iam.gserviceaccount.com}"

echo -e "${BLUE}=== Firebase Function Deploy - Project Permissions Setup ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Deploy Service Account: $DEPLOY_SA"
echo "Deploy Service Account Project: $DEPLOY_SA_PROJECT"
if [ -n "$BUCKET_PROJECT" ]; then
  echo "Bucket Project: $BUCKET_PROJECT"
  echo "Bucket Name: $BUCKET_NAME"
fi
echo ""

# Check gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}Error: gcloud CLI is not installed${NC}"
  exit 1
fi

# Enable APIs used by Firebase CLI in the project that owns the deployment
# identity. Without these, deployment can fail before it reaches the target.
echo ""
echo -e "${BLUE}=== Enabling Deploy Service Account Project APIs ===${NC}"

DEPLOY_SA_PROJECT_APIS=(
  "cloudresourcemanager.googleapis.com"
  "firebase.googleapis.com"
  "serviceusage.googleapis.com"
  "iam.googleapis.com"
)

for API in "${DEPLOY_SA_PROJECT_APIS[@]}"; do
  echo -e "${BLUE}Enabling $API in $DEPLOY_SA_PROJECT...${NC}"
  gcloud services enable "$API" --project="$DEPLOY_SA_PROJECT"
  echo -e "${GREEN}✓ $API${NC}"
done

# Get project number (needed for default compute SA)
echo -e "${BLUE}Fetching project number...${NC}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "Project Number: $PROJECT_NUMBER"

COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
APP_ENGINE_SA="${PROJECT_ID}@appspot.gserviceaccount.com"

echo ""
echo -e "${BLUE}=== Enabling Target Project APIs ===${NC}"

TARGET_PROJECT_APIS=(
  "cloudfunctions.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "run.googleapis.com"
  "eventarc.googleapis.com"
  "pubsub.googleapis.com"
  "storage.googleapis.com"
  "firebaseextensions.googleapis.com"
  "cloudbilling.googleapis.com"
  "firebase.googleapis.com"
  "iam.googleapis.com"
)

for API in "${TARGET_PROJECT_APIS[@]}"; do
  echo -e "${BLUE}Enabling $API in $PROJECT_ID...${NC}"
  gcloud services enable "$API" --project="$PROJECT_ID"
  echo -e "${GREEN}✓ $API${NC}"
done

echo ""
echo -e "${BLUE}=== Granting Target Project IAM Roles ===${NC}"

# Grant Firebase Admin
echo -e "${BLUE}1. Granting Firebase Admin role to $DEPLOY_SA...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/firebase.admin" \
  --condition=None
echo -e "${GREEN}✓ Firebase Admin${NC}"

# Grant Service Account User on default compute SA (Gen 2 runtime SA)
echo -e "${BLUE}2. Granting Service Account User on compute SA ($COMPUTE_SA)...${NC}"
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"
echo -e "${GREEN}✓ Service Account User (compute SA)${NC}"

# Grant Service Account User on App Engine default SA.
# firebase-tools' deploy preflight checks iam.serviceAccounts.actAs on this
# account for any Firebase Functions deploy — required even when every
# deployed function is Gen 2 and does not run as this SA.
echo -e "${BLUE}3. Granting Service Account User on App Engine SA ($APP_ENGINE_SA)...${NC}"
if ! gcloud iam service-accounts add-iam-policy-binding "$APP_ENGINE_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"; then
  echo -e "${YELLOW}  ⚠ Could not bind. If the App Engine SA does not exist yet, open the project's${NC}"
  echo -e "${YELLOW}    App Engine page once (https://console.cloud.google.com/appengine?project=$PROJECT_ID)${NC}"
  echo -e "${YELLOW}    to provision it, then rerun this script.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Service Account User (App Engine SA)${NC}"

# Grant Service Usage Consumer
echo -e "${BLUE}4. Granting Service Usage Consumer role to $DEPLOY_SA...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --condition=None
echo -e "${GREEN}✓ Service Usage Consumer${NC}"

# The default compute account is the Gen 2 runtime identity and is commonly
# also the default Cloud Build identity in Firebase projects.
echo -e "${BLUE}5. Granting Firebase Viewer to runtime SA ($COMPUTE_SA)...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/firebase.viewer" \
  --condition=None
echo -e "${GREEN}✓ Firebase Viewer (runtime SA)${NC}"

echo -e "${BLUE}6. Granting Cloud Build Builder to build SA ($COMPUTE_SA)...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/cloudbuild.builds.builder" \
  --condition=None
echo -e "${GREEN}✓ Cloud Build Builder (build SA)${NC}"

# Bucket permissions setup (if provided)
if [ -n "$BUCKET_PROJECT" ] && [ -n "$BUCKET_NAME" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  === Bucket Permissions Setup ===${NC}"
  echo -e "${YELLOW}WARNING: This grants Storage Object Admin to the compute SA.${NC}"
  echo -e "${YELLOW}Make sure the bucket is the correct one.${NC}"
  echo ""
  
  # Grant Storage Object Admin on bucket to compute SA
  echo -e "${BLUE}Granting Storage Object Admin on gs://$BUCKET_NAME to $COMPUTE_SA...${NC}"
  gsutil iam ch "serviceAccount:${COMPUTE_SA}:objectAdmin" "gs://${BUCKET_NAME}" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not grant via gsutil. You may need to manually grant Storage Object Admin.${NC}"
    echo "    Navigate to: https://console.cloud.google.com/storage/browser/$BUCKET_NAME?project=$BUCKET_PROJECT"
    echo "    Grant 'Storage Object Admin' to: $COMPUTE_SA"
  }
  echo -e "${GREEN}✓ Storage Object Admin (or manual step required)${NC}"
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Summary:"
echo "  ✓ Firebase Admin role granted"
echo "  ✓ Service Account User role granted on compute SA (Gen 2 runtime)"
echo "  ✓ Service Account User role granted on App Engine SA (firebase-tools preflight)"
echo "  ✓ Service Usage Consumer role granted"
echo "  ✓ Firebase Viewer role granted to runtime SA"
echo "  ✓ Cloud Build Builder role granted to build SA"
echo "  ✓ Required APIs enabled in $DEPLOY_SA_PROJECT and $PROJECT_ID"
if [ -n "$BUCKET_PROJECT" ] && [ -n "$BUCKET_NAME" ]; then
  echo "  ✓ Storage Object Admin granted on bucket (or manual step noted)"
fi
echo ""
echo "Next steps:"
echo "  1. Verify permissions in Google Cloud Console"
echo "  2. If deploying to a new project, run the GitHub workflow"
if [ -n "$BUCKET_PROJECT" ]; then
  echo "  3. Ensure Storage API is enabled in bucket project:"
  echo "     https://console.cloud.google.com/apis/library/storage.googleapis.com?project=$BUCKET_PROJECT"
else
  echo "  3. If this project uses a different bucket, rerun with bucket parameters:"
  echo "     $0 $PROJECT_ID $DEPLOY_SA <BUCKET_PROJECT> <BUCKET_NAME>"
fi
