import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.TARGET_BUCKET) {
  throw new Error("TARGET_BUCKET is not set in environment variables.");
}
if (!("ENFORCE_APP_CHECK" in process.env)) {
  throw new Error("ENFORCE_APP_CHECK is not set in environment variables.");
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

    const { _firebaseFunction_fileName, _firebaseFunction_folderPrefix, _appId, _userPseudoID, ...payload } = data;

    if (!_firebaseFunction_fileName || !_firebaseFunction_folderPrefix) {
      throw new HttpsError(
        "invalid-argument",
        "Missing _firebaseFunction_fileName or _firebaseFunction_folderPrefix."
      );
    }

    if (!_userPseudoID || typeof _userPseudoID !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "Missing or invalid userPseudoId."
        );
    }

    const normalizedUserId = _userPseudoID.toUpperCase().replace(/-/g, "");
    const appId = _appId || process.env.APP_ID || "unknown_app";

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
    const filePath = `${_firebaseFunction_folderPrefix}/${datePath}/${appId}/${fileName}`;

    logger.log("Saving Attribution data to:", filePath);
  
    const bucketName = process.env.TARGET_BUCKET;

    console.log("TARGET_BUCKET:", bucketName);

    if (!bucketName) {
      throw new HttpsError(
        "internal",
        "TARGET_BUCKET environment variable is not set."
      );
    }

    const bucket = admin.storage().bucket(bucketName);

    try {
      // Attempt a dummy write to check permissions
      await bucket.file(`.permission_check/${Date.now()}.tmp`).save("test", {
        contentType: "text/plain",
        resumable: false,
      });
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

    await bucket.file(filePath).save(JSON.stringify(payload), {
      contentType: "application/json",
    });

    return {success: true, filePath: `gs://${bucketName}/${filePath}`};
  }
);
