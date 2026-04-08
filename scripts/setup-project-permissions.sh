#!/bin/bash

# Setup Firebase Function Deploy Permissions
# Usage: ./setup-project-permissions.sh <PROJECT_ID> [DEPLOY_SERVICE_ACCOUNT_EMAIL] [BUCKET_PROJECT] [BUCKET_NAME]
# Example: ./setup-project-permissions.sh dietbet-staging firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com appex-data-imports appex_app_payloads

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
  echo -e "${RED}Error: PROJECT_ID is required${NC}"
  echo "Usage: $0 <PROJECT_ID> [DEPLOY_SERVICE_ACCOUNT_EMAIL] [BUCKET_PROJECT] [BUCKET_NAME]"
  echo "Example: $0 dietbet-staging firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com appex-data-imports appex_app_payloads"
  exit 1
fi

PROJECT_ID="$1"
DEPLOY_SA="${2:-firebase-function-deploy@appex-data-imports.iam.gserviceaccount.com}"
BUCKET_PROJECT="$3"
BUCKET_NAME="$4"

echo -e "${BLUE}=== Firebase Function Deploy - Project Permissions Setup ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Deploy Service Account: $DEPLOY_SA"
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

# Set project
echo -e "${BLUE}Setting gcloud project...${NC}"
gcloud config set project "$PROJECT_ID"

# Get project number (needed for default compute SA)
echo -e "${BLUE}Fetching project number...${NC}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "Project Number: $PROJECT_NUMBER"

COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo ""
echo -e "${BLUE}=== Granting IAM Roles ===${NC}"

# Grant Firebase Admin
echo -e "${BLUE}1. Granting Firebase Admin role to $DEPLOY_SA...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/firebase.admin" \
  --condition=None \
  2>/dev/null || echo "  (Already granted or skipped)"
echo -e "${GREEN}✓ Firebase Admin${NC}"

# Grant Service Account User on default compute SA
echo -e "${BLUE}2. Granting Service Account User on compute SA ($COMPUTE_SA)...${NC}"
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "  (Already granted or skipped)"
echo -e "${GREEN}✓ Service Account User${NC}"

# Grant Service Usage Consumer
echo -e "${BLUE}3. Granting Service Usage Consumer role to $DEPLOY_SA...${NC}"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --condition=None \
  2>/dev/null || echo "  (Already granted or skipped)"
echo -e "${GREEN}✓ Service Usage Consumer${NC}"

echo ""
echo -e "${BLUE}=== Enabling Required APIs ===${NC}"

APIS=(
  "cloudfunctions.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "run.googleapis.com"
  "eventarc.googleapis.com"
)

for API in "${APIS[@]}"; do
  echo -e "${BLUE}Enabling $API...${NC}"
  gcloud services enable "$API" --project="$PROJECT_ID" 2>/dev/null || echo "  (Already enabled or skipped)"
  echo -e "${GREEN}✓ $API${NC}"
done

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
# Bucket permissions setup (if provided)
if [ -n "$BUCKET_PROJECT" ] && [ -n "$BUCKET_NAME" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  === Bucket Permissions Setup ===${NC}"
  echo -e "${YELLOW}WARNING: This grants Storage Object Admin to the compute SA.${NC}"
  echo -e "${YELLOW}Make sure the bucket is the correct one.${NC}"
  echo ""
  
  # Switch to bucket project
  gcloud config set project "$BUCKET_PROJECT"
  
  # Grant Storage Object Admin on bucket to compute SA
  echo -e "${BLUE}Granting Storage Object Admin on gs://$BUCKET_NAME to $COMPUTE_SA...${NC}"
  gsutil iam ch "serviceAccount:${COMPUTE_SA}:objectAdmin" "gs://${BUCKET_NAME}" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not grant via gsutil. You may need to manually grant Storage Object Admin.${NC}"
    echo "    Navigate to: https://console.cloud.google.com/storage/browser/$BUCKET_NAME?project=$BUCKET_PROJECT"
    echo "    Grant 'Storage Object Admin' to: $COMPUTE_SA"
  }
  echo -e "${GREEN}✓ Storage Object Admin (or manual step required)${NC}"
  
  # Switch back to deployment project
  gcloud config set project "$PROJECT_ID"
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Summary:"
echo "  ✓ Firebase Admin role granted"
echo "  ✓ Service Account User role granted on compute SA"
echo "  ✓ Service Usage Consumer role granted"
echo "  ✓ All required APIs enabled"
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
