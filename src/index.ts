import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.TARGET_BUCKET) {
  console.warn("Warning: TARGET_BUCKET is not set in environment variables.");
}
if (!("ENFORCE_APP_CHECK" in process.env)) {
  console.warn("Warning: ENFORCE_APP_CHECK is not set in environment variables. Defaulting to false.");
}

admin.initializeApp();
console.log("Firebase admin initialized.");

export const saveAttributionData = onCall(
  {
    enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true",
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

    const { _firebaseFunction_fileName, _firebaseFunction_folderPrefix, ...payload } = data;

    if (!_firebaseFunction_fileName || !_firebaseFunction_folderPrefix) {
      throw new HttpsError(
        "invalid-argument",
        "Missing _firebaseFunction_fileName or _firebaseFunction_folderPrefix."
      );
    }

    const bucketName = process.env.TARGET_BUCKET;

    console.log("TARGET_BUCKET:", bucketName);

    if (!bucketName) {
      throw new HttpsError(
        "internal",
        "TARGET_BUCKET environment variable is not set."
      );
    }

    const bucket = admin.storage().bucket(bucketName);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const datePath = `${yyyy}${mm}${dd}`;
    const timestamp = Date.now();
    const fileName = `${_firebaseFunction_fileName}_${timestamp}.json`;
    const filePath = `${_firebaseFunction_folderPrefix}/${datePath}/${fileName}`;

    logger.log("Saving Attribution data to:", filePath);

    await bucket.file(filePath).save(JSON.stringify(payload), {
      contentType: "application/json",
    });

    return {success: true, filePath: `gs://${bucketName}/${filePath}`};
  }
);
