# Firebase Function Save Payload (Data Upload)

This module provides a Firebase Cloud Function for uploading a payload to a Google Cloud Bucket.

## Swift Integration

You can use this struct in your iOS app to send conversion data to your Firebase Cloud Function (`savePayload`), which saves the payload into a Cloud Storage bucket.

### Sample Usage (iOS)

```swift
import FirebaseCore
import FirebaseFunctions

public struct FirebaseFunctionAttribution {
    
    public static let functions: Functions = {
        let instance = Functions.functions()
        instance.useEmulator(withHost: "localhost", port: 5001) // 🔹 Remove this line for production builds.
        return instance
    }()

    public static let payload: [String: Any] = [
        "payload": [
            "installDate": "2025-04-03",
            "campaign": "spring_sale",
            "userId": "12345"
        ],
        "userPseudoID": "54321",
        "folderPrefix": "attribution_data"
    ]
    
    public static func onConversionDataSuccess(_ data: [String: Any]) {
        functions.httpsCallable("savePayload").call(data) { result, error in
            if let error = error as NSError? {
                print("Cloud Function error: \(error.localizedDescription)")
                print("Error details: \(error.userInfo)")
            } else if let resultData = result?.data as? [String: Any] {
                if let success = resultData["success"] as? Bool, success {
                    print("AppsFlyer data uploaded successfully.")
                }
                if let path = resultData["filePath"] as? String {
                    print("File stored at: \(path)")
                }
            }
        }
    }
}
```

> ℹ️ **Important:** Remove `instance.useEmulator(withHost:port:)` when building for production.

### Sample Usage (Android)

```kotlin
import com.google.firebase.functions.FirebaseFunctions

object FirebaseFunctionAttribution {

    private val functions: FirebaseFunctions by lazy {
        val instance = FirebaseFunctions.getInstance()
        // instance.useEmulator("10.0.2.2", 5001) // 🔹 Uncomment this line for local emulator testing
        instance
    }

    private val payload: Map<String, Any> = mapOf(
        "payload" to mapOf(
            "installDate" to "2025-04-03",
            "campaign" to "spring_sale",
            "userId" to "12345"
        ),
        "userPseudoID" to "54321",
        "folderPrefix" to "attribution_data"
    )

    fun onConversionDataSuccess(data: Map<String, Any> = payload) {
        functions
            .getHttpsCallable("savePayload")
            .call(data)
            .addOnSuccessListener { result ->
                val resultData = result.data as? Map<*, *>
                if (resultData?.get("success") == true) {
                    println("AppsFlyer data uploaded successfully.")
                }
                val path = resultData?.get("filePath")
                println("File stored at: $path")
            }
            .addOnFailureListener { e ->
                println("Cloud Function error: ${e.message}")
            }
    }
}
```

> ℹ️ **Important:** Remove `useEmulator("10.0.2.2", 5001)` when building for production.

### Notes

- The Cloud Function **requires** `userPseudoID` and `folderPrefix` to build the destination path in Cloud Storage, as shown in the Swift example above.
- The `payload` dictionary must be provided and may include fields like `installDate`, `campaign`, and `userId`, or any other payload you want to store.
- The JSON payload will be stored at: `gs://<TARGET_BUCKET>/<folderPrefix>/YYYYMMDD/<appId>/<userPseudoID>-<timestamp>.json`.
- This sample uses the emulator (`localhost:5001`) for development. Remove the `useEmulator` line for production use.

## Cloud Function Configuration

Make sure you have set the `TARGET_BUCKET` environment variable for your Firebase function. This determines where the uploaded file will be stored in Cloud Storage.

The Cloud Function expects a single dictionary containing both metadata (e.g., `userPseudoID`, `folderPrefix`) and a nested `payload` dictionary. These are combined in the request body and processed together.

---

### ☁️ Cloud Storage Permissions

Make sure your Cloud Function's service account has permission to write to your bucket.

The service account typically looks like:

```
<PROJECT_NUMBER>@gcf-admin-robot.iam.gserviceaccount.com
```

**Grant "Storage Object Admin" role** to this service account on your Cloud Storage bucket:

1. Go to Google Cloud Console → Storage → Buckets → [your bucket] → Permissions.
2. Click **"Grant Access"**.
3. Add the service account email.
4. Assign role: **Storage Object Admin**.

Without this permission, uploads will fail with `storage.objects.create` denied errors.

## 🔥 Working with This Cloud Function Repo

This repo is designed to be deployed across **multiple Firebase projects**.

### 🚀 Getting Started

1. **Clone the Repo**

   ```bash
   git clone git@github.com:TechArtists/backend-firebase-function-save-payload.git
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Set Up Your Environment**

   Create your own `.env` file from the example:

   ```bash
   cp .env.example .env
   ```

   Then set your Firebase project-specific variables:

   ```env
   TARGET_BUCKET=your-bucket-name
   ```

4. **Link to Your Firebase Project**

   Log in and set up Firebase CLI:

   ```bash
   firebase login
   firebase use --add
   ```

   Then deploy with:

   ```bash
   firebase deploy --only functions
   ```

---

### 🔐 (Optional) Use Firebase Secrets

Instead of using a `.env` file, you can configure project secrets securely:

```bash
firebase functions:secrets:set TARGET_BUCKET
```

---

### 📂 Project Structure

```
functions/
├── src/                  # TypeScript source files
├── .env.example          # Sample environment file
├── .gitignore
├── package.json
└── tsconfig.json
```

---

### 🧪 Local Development

You can test with emulators:

```bash
firebase emulators:start
```

Make sure your `.env` is set up for local testing.

---

### 🔒 App Check Enforcement

If your function enforces App Check, make sure your iOS app is properly configured with App Check tokens when calling `savePayload`.

During development, you can use `AppCheckDebugProviderFactory()` on simulators to bypass verification.

---
