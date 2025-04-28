import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import {Bucket} from "@google-cloud/storage";
import {firebase_v1beta1, google} from "googleapis";
import {OAuth2Client} from "google-auth-library";

dotenv.config();

const appMetadataCache = new Map<string, { platformId: string }>();

if (!process.env.TARGET_BUCKET) {
  throw new Error("TARGET_BUCKET is not set in environment variables.");
}

admin.initializeApp();
console.log("Firebase admin initialized.");

export const savePayload=onCall(
  {
    enforceAppCheck: true,
    secrets: [],
  },
  async (request) => {
    const data = request.data;

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Data must be a non-empty JSON object."
      );
    }

    const {folderPrefix, userPseudoID, payload} = data;
    const appCheckToken = request.rawRequest.headers["x-firebase-appcheck"] as string;

    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    let firebaseAppId = "emulator_app_id";

    if (isEmulator) {
      logger.debug("Running in emulator, skipping App Check verification.");
      firebaseAppId = "emulator_app_id";
    } else {
      if (!appCheckToken || typeof appCheckToken !== "string") {
        throw new HttpsError("unauthenticated", "App Check token is missing or malformed.");
      }

      try {
        const decodedAppCheckToken = await admin.appCheck().verifyToken(appCheckToken);
        firebaseAppId = decodedAppCheckToken.appId;
      } catch (err) {
        logger.error("App Check token verification failed:", err);
        throw new HttpsError("unauthenticated", "Invalid App Check token.");
      }
    }

    if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Payload must be a non-empty JSON object."
      );
    }

    if (!folderPrefix || !userPseudoID) {
      throw new HttpsError(
        "invalid-argument",
        "Missing folderPrefix or userPseudoID in the payload."
      );
    }

    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;

    if (!projectId) {
      logger.error("Project ID is not set. Ensure GCP_PROJECT or GCLOUD_PROJECT is defined in the environment.");
      throw new HttpsError("internal", "Missing project ID configuration.");
    }

    const appInfo = await mapAppIdToAppDetails(projectId!, firebaseAppId);
    const platformId = appInfo.platformId;

    const filePath = generateFilePath(userPseudoID, folderPrefix, platformId);

    logger.log("Saving Payload data to:", filePath);

    const bucketName = process.env.TARGET_BUCKET;

    console.log("TARGET_BUCKET:", bucketName);

    if (!bucketName) {
      throw new HttpsError(
        "internal",
        "TARGET_BUCKET environment variable is not set."
      );
    }

    const bucket = admin.storage().bucket(bucketName);

    await checkBucketWritePermission(bucket);

    const jsonLines = JSON.stringify(JSON.parse(JSON.stringify(payload, Object.keys(payload).sort())));

    await bucket.file(filePath).save(jsonLines, {
      contentType: "application/json",
    });

    return {success: true, filePath: `gs://${bucketName}/${filePath}`};
  }
);

async function mapAppIdToAppDetails(projectId: string, firebaseAppId: string) {
  if (appMetadataCache.has(firebaseAppId)) {
    return appMetadataCache.get(firebaseAppId)!;
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/firebase"],
  });

  const authClient = await auth.getClient();

  const firebase = new firebase_v1beta1.Firebase({
    auth: authClient as OAuth2Client,
  });

  const [androidAppsRes, iosAppsRes] = await Promise.all([
    firebase.projects.androidApps.list({parent: `projects/${projectId}`}),
    firebase.projects.iosApps.list({parent: `projects/${projectId}`}),
  ]);

  const androidApp = androidAppsRes.data.apps?.find((app) => app.appId === firebaseAppId);
  if (androidApp) {
    const result = {platformId: androidApp.packageName!};
    appMetadataCache.set(firebaseAppId, result);
    return result;
  }

  const iosApp = iosAppsRes.data.apps?.find((app) => app.appId === firebaseAppId);
  if (iosApp) {
    const result = {platformId: iosApp.bundleId!};
    appMetadataCache.set(firebaseAppId, result);
    return result;
  }

  return {platformId: "unknown_platform_id"};
}

async function checkBucketWritePermission(bucket: Bucket): Promise<void> {
  const tempFilePath = `.permission_check/${Date.now()}.tmp`;
  const tempFile = bucket.file(tempFilePath);

  try {
    await tempFile.save("test", {
      contentType: "text/plain",
      resumable: false,
    });

    await tempFile.delete();
  } catch (err: any) {
    logger.error("Permission check failed:", err);
    const errorCode = err?.code || err?.status;

    if (errorCode === 403 || errorCode === 401 || err?.message?.includes("permission")) {
      throw new HttpsError(
        "permission-denied",
        "The project does not have permission to write to the specified bucket."
      );
    }

    throw new HttpsError(
      "internal",
      "Failed to verify bucket access. Reason: " + (err?.message || "Unknown error")
    );
  }
}

function generateFilePath(userPseudoID: string, folderPrefix: string, appId: string): string {
  const normalizedUserId = userPseudoID.toUpperCase().replace(/-/g, "");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const datePath = `${yyyy}${mm}${dd}`;
  const timestamp = `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
  const fileName = `${normalizedUserId}-${timestamp}.json`;
  const filePath = `${folderPrefix}/${datePath}/${appId}/${fileName}`;
  return filePath;
}
