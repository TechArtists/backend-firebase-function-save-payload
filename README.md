# Firebase Function Save Payload (Data Upload)

This module provides a Firebase Cloud Function for uploading a JSON payload to a Google Cloud Bucket with this format:
   `gs://<TARGET_BUCKET>/<folderPrefix>/<YYYYMMDD>/<appID>/<userPseudoID>-<timestamp>.json`

where:

- `<TARGET_BUCKET>` is defined during the deploy
- `<folderPrefix>`, `<userPseudoID`> are app provided parameters
- `<appID>` is inserted by the server based on the Firebase app setings and:
  - for Android, always `package_name`
  - for iOS, it first tries the `App Store ID`. If that's not available, then it falls back to the `bundle ID`
- `<YYYMMDD>` & `<timestamp>` are added by the server in ISO8601 format (e.g. `20250429T115622`)


## Swift Integration

You can use this struct in your iOS app to send conversion data to your Firebase Cloud Function (`savePayload`), which saves the payload into a Cloud Storage bucket.

### Sample Usage (iOS)

```swift
import FirebaseCore
import FirebaseFunctions

public enum FirebaseFunctionSavePayload {
    private static let functions: Functions = {
        let instance = Functions.functions()
        return instance
    }()

    public static func savePayload( folderPrefix: String, userPseudoID: String, payload: [String: Any]) {
        let payloadToSend: [String: Any] = [
            "payload": payload,
            "userPseudoID": userPseudoID,
            "folderPrefix": folderPrefix
        ]
        functions.httpsCallable("savePayload").call(payloadToSend) { result, error in
            if let error = error as NSError? {
                Logger.analytics.error("Cloud Function error: \(error.localizedDescription)")
                Logger.analytics.error("Error details: \(error.userInfo)")
            } else if let resultData = result?.data as? [String: Any] {
                if let success = resultData["success"] as? Bool, success {
                    Logger.analytics.info("AppsFlyer data uploaded successfully.")
                }
                if let path = resultData["filePath"] as? String {
                    Logger.analytics.info("File stored at: \(path)")
                }
            }
        }
    }
}
```

> ℹ️ **Important:** Remove `instance.useEmulator(withHost:port:)` when building for production.

### Sample Usage (Android)

```kotlin
import android.util.Log
import com.google.firebase.functions.FirebaseFunctions

object FirebaseFunctionSavePayload {

    private val functions: FirebaseFunctions by lazy {
        FirebaseFunctions.getInstance()
    }

    fun savePayload(
        folderPrefix: String,
        userPseudoID: String,
        payload: Map<String, Any>
    ) {
        val payloadToSend = mapOf(
            "payload" to payload,
            "userPseudoID" to userPseudoID,
            "folderPrefix" to folderPrefix
        )

        functions
            .getHttpsCallable("savePayload")
            .call(payloadToSend)
            .addOnSuccessListener { result ->
                val resultData = result.data as? Map<*, *>
                if (resultData?.get("success") == true) {
                    Log.i("Analytics", "AppsFlyer data uploaded successfully.")
                }
                val path = resultData?.get("filePath")
                if (path != null) {
                    Log.i("Analytics", "File stored at: $path")
                }
            }
            .addOnFailureListener { e ->
                Log.e("Analytics", "Cloud Function error: ${e.localizedMessage}")
                Log.e("Analytics", "Error details: ${e}")
            }
    }
}
```

> ℹ️ **Important:** Remove `useEmulator("10.0.2.2", 5001)` when building for production.

### Notes

- The Cloud Function **requires** `userPseudoID` and `folderPrefix` to build the destination path in Cloud Storage, as shown in the Swift example above.
- The `payload` dictionary must be provided and may include fields like `installDate`, `campaign`, and `userId`, or any other payload you want to store.
- This sample uses the emulator (`localhost:5001`) for development. Remove the `useEmulator` line for production use.

## Cloud Function Configuration

Make sure you have set the `TARGET_BUCKET` environment variable for your Firebase function. This determines where the uploaded file will be stored in Cloud Storage.

The Cloud Function expects a single dictionary containing both metadata (e.g., `userPseudoID`, `folderPrefix`) and a nested `payload` dictionary. These are combined in the request body and processed together.

The `savePayload` Cloud Function expects the incoming request body to be a dictionary containing:

- `userPseudoID`: A unique user identifier, provided by the Firebase SDK on the client side.
- `folderPrefix`: A constant string that defines the subfolder structure within the bucket.
- `payload`: A nested dictionary containing the actual data you want to store (e.g., install dates, campaigns, user IDs).

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

## 🔒 Setting Up Firebase and App Check (iOS)

Before calling the `savePayload` Cloud Function, initialize Firebase and App Check in your app.

Example setup:

```swift
import FirebaseCore
import FirebaseAppCheck

// App Check Provider Factory for devices
class AppAttestProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        AppAttestProvider(app: app)
    }
}

private func setupFirebase() {
    #if targetEnvironment(simulator)
    // Use debug provider for simulator
    AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    #else
    // Use App Attest on real devices
    AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
    #endif

    // Initialize Firebase
    FirebaseApp.configure()
}
```

> ℹ️ **Simulator**: Use `AppCheckDebugProviderFactory()` to bypass App Check during simulator testing.
> ℹ️ **Real Devices**: Ensure App Attest is enabled in your Firebase Console for production use.

If App Check is not configured properly, Cloud Function calls may fail with `unauthenticated` errors.

## 🔒 Setting Up Firebase and App Check (Android)

Before calling the `savePayload` Cloud Function, initialize Firebase and App Check in your Android app.

Example setup:

```kotlin
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

fun setupFirebase(application: Application) {
    FirebaseApp.initializeApp(application)

    val firebaseAppCheck = FirebaseAppCheck.getInstance()

    if (BuildConfig.DEBUG) {
        // Use Debug provider for local builds
        firebaseAppCheck.installAppCheckProviderFactory(
            DebugAppCheckProviderFactory.getInstance()
        )
    } else {
        // Use Play Integrity on real devices
        firebaseAppCheck.installAppCheckProviderFactory(
            PlayIntegrityAppCheckProviderFactory.getInstance()
        )
    }
}
```

> ℹ️ **Simulator / Emulator**: Use `DebugAppCheckProviderFactory` when testing on Android emulators.
> ℹ️ **Real Devices**: Ensure Play Integrity is enabled in your Firebase Console for production use.

If App Check is not configured properly, Cloud Function calls may fail with `unauthenticated` errors.
