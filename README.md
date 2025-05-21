# Firebase Function Save Payload (Data Upload)

This module provides a Firebase Cloud Function for uploading a JSON payload to a Google Cloud Bucket with this format:
   `gs://<TARGET_BUCKET>/<folderPrefix>/<YYYYMMDD>/<appID>/<userPseudoID>-<timestamp>.json`

where:

- `<TARGET_BUCKET>` is defined during the deploy
- `<folderPrefix>`, `<userPseudoID`> are app provided parameters
- `<appID>` is inserted by the server based on the Firebase app settings and:
  - for Android, it prefixes with `ANDROID-` followed by the `package_name`
  - for iOS, it prefixes with `IOS-` followed by the `App Store ID` if available; otherwise, the `bundle ID`
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
### GitHub Workflow Deployment

### Prerequisites

Before deploying Firebase Functions using the GitHub workflow, ensure the following setup is completed:

1. **Service Account Setup**
   - Create a service account named `firebase-function-deploy` in your GCP project (it is not mandatory to be the same project where the Firebase Function will be deployed)
   - Store the service account key as a GitHub secret named `GCP_SA_KEY`

   **Steps:** (Project where the SA was created)
   1. Go to Google Cloud Console → IAM & Admin → Service Accounts
   2. Click "Create Service Account"
   3. Name it `firebase-function-deploy`
   4. Click "Create and Continue"
   5. Click "Done"
   6. Find the created service account and click on it
   7. Go to "Keys" tab
   8. Click "Add Key" → "Create new key"
   9. Choose JSON format and click "Create"
   10. The key file will be downloaded automatically
   11. Go to your GitHub repository → Settings → Secrets and variables → Actions
   12. Click "New repository secret"
   13. Name: `GCP_SA_KEY`
   14. Value: Paste the entire contents of the downloaded JSON key file
   15. Click "Add secret"

2. **IAM Permissions Configuration**
   In the target project (where Firebase Functions will be deployed):
   - Grant Firebase Admin role to the `firebase-function-deploy` service account
   - Grant Service Account User role to the `firebase-function-deploy` service account on the default compute service account

   **Steps:**
   1. Go to Google Cloud Console → IAM & Admin → IAM
   2. Click "Edit" (pencil icon) for the `firebase-function-deploy` service account
   3. Click "Add another role"
   4. Search for and select "Firebase Admin"
   5. Click "Save"
   6. Go the IAM & Admin -> Service Accounts and find the default compute service account (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`) in the list.
   7. Click the three vertical dots under the "Actions" column for this service account.
   8. Select **"Manage permissions"** from the dropdown.
   9. In the "Permissions" tab, click **"Grant access"**.
   10. In the "Add principals" field, enter the email of your `firebase-function-deploy` service account.
   11. Under "Assign roles," select **Service Account User**.
   12. Click **Save**.

3. **Storage Bucket Permissions**
   In the project where the storage bucket is created:
   - Grant Storage Object Admin role to the target project's default compute service account

   **Steps:**
   1. Go to Google Cloud Console → Storage → Buckets
   2. Click on your target bucket
   3. Go to "Permissions" tab
   4. Click "Grant Access"
   5. Add the default compute service account email (`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`)
   6. Select role: "Storage Object Admin"
   7. Click "Save"

4. **Required GCP APIs**
   For first-time deployments to a project, enable the following APIs:

   **Steps:**
   1. Go to Google Cloud Console → APIs & Services → Library
   2. Search for and enable each of these APIs:
      - Cloud Functions API
      - Artifact Registry API
      - Cloud Build API
      - Cloud Run Admin API
      - Eventarc API
   3. For each API:
      - Click on the API name
      - Click "Enable"
      - Wait for the API to be enabled before proceeding to the next one

5. **Artifact Registry Policy**
   Run the following command to activate artifact policies:
   ```bash
   firebase functions:artifacts:setpolicy --project=<your-firebase-project> --location=us-central1
   ```

### Deployment Process

1. Navigate to the "Actions" tab in your GitHub repository
2. Select the "Call Firebase Deploy" workflow
3. Click "Run workflow"
4. Configure the deployment parameters:
   - `function-name`: Name of the Firebase function to deploy
   - `projects`: Comma-separated list of target projects
   - `target-bucket`: Target storage bucket name

The workflow will automatically handle the deployment process across all specified projects.

## 🔥 Working with This Cloud Function Repo

This repo is designed to be deployed across **multiple Firebase projects**.

### 🚀 Getting Started

This repo is designed to be **added to an existing Firebase project**, not deployed standalone.

---

1. **Clone the Repo**

   ```bash
   git clone https://github.com/TechArtists/backend-firebase-function-save-payload.git
   ```

2. **Integrate into Your Firebase Project**

   Inside your Firebase project root:

   ```bash
   cd your-firebase-project
   ```

   Copy the contents of this repo into your `functions/` folder.

3. **Install Dependencies**

   ```bash
   cd functions
   npm install
   ```

4. **Set Up Your Environment**

   Create your own `.env` file:

   ```bash
   touch .env
   ```

   Then add your Firebase project-specific variables:

   ```env
   TARGET_BUCKET=your-bucket-name
   ```

   Or, alternatively, use Firebase Functions config:

   ```bash
   firebase functions:config:set env.target_bucket="your-bucket-name"
   ```

5. **Link to Your Firebase Project**

   Log in and set up the Firebase CLI:

   ```bash
   firebase login
   firebase use --add
   ```

6. **Build and Deploy**

   ```bash
   npm run build
   firebase deploy --only functions:savePayload
   ```

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
