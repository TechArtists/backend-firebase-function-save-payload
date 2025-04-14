import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {v4 as uuidv4} from "uuid";
import * as dotenv from "dotenv";
dotenv.config();

admin.initializeApp();
console.log("Firebase admin initialized.");

export const saveAppsFlyerData = onCall(
  {
    enforceAppCheck: false,
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
    const uniqueId = uuidv4();
    const filePath = `AppsFlyer/${datePath}/${uniqueId}.json`;

    logger.log("Saving AppsFlyer data to:", filePath);

    await bucket.file(filePath).save(JSON.stringify(data), {
      contentType: "application/json",
    });

    return {success: true, filePath: `gs://${bucketName}/${filePath}`};
  }
);
