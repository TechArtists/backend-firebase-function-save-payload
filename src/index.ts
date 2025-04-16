import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import { Bucket } from "@google-cloud/storage";

dotenv.config();

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
        "Payload must be a non-empty JSON object."
      );
    }
    
    const { folderPrefix, userPseudoID, payload } = data;

    if (!folderPrefix || !userPseudoID) {
      throw new HttpsError(
        "invalid-argument",
        "Missing folderPrefix or userPseudoID in the payload."
      );
    }

    const appId = process.env.APP_ID || "unknown_app";

    const filePath = generateFilePath(userPseudoID, folderPrefix, appId);

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

    const jsonLines = Array.isArray(payload)
    ? payload.map((item) => JSON.stringify(item)).join("\n")
    : JSON.stringify(payload);
  
    await bucket.file(filePath).save(jsonLines, {
      contentType: "application/json",
    });

    return {success: true, filePath: `gs://${bucketName}/${filePath}`};
  }
);

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