# Firebase Function Attribution (Data Upload)

This module provides a Swift utility for uploading attribution data to a Firebase Cloud Function.

## Swift Integration

You can use this struct in your iOS app to send conversion data to your Firebase Cloud Function (`saveAttributionData`), which saves the payload into a Cloud Storage bucket.

### Sample Usage

```swift
import FirebaseCore
import FirebaseFunctions

public struct FirebaseFunctionAttribution {
    
    public static let functions: Functions = {
        let instance = Functions.functions()
        instance.useEmulator(withHost: "localhost", port: 5001)
        return instance
    }()

    public static let payload: [String: Any] = [
        "installDate": "2025-04-03",
        "campaign": "spring_sale",
        "userId": "12345",
        "_firebaseFunction_fileName": "appsflyer_conversion_data",
        "_firebaseFunction_folderPrefix": "attribution_data"
    ]
    
    public static func onConversionDataSuccess(_ data: [String: Any]) {
        functions.httpsCallable("saveAttributionData").call(data) { result, error in
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

### Notes

- The Cloud Function **requires** `_firebaseFunction_fileName` and `_firebaseFunction_folderPrefix` to build the destination path in Cloud Storage.
- This function stores JSON data at: `gs://<TARGET_BUCKET>/<folderPrefix>/YYYYMMDD/<fileName>.json`.
- This sample uses the emulator (`localhost:5001`) for development. Remove the `useEmulator` line for production use.

## Cloud Function Configuration

Make sure you have set the `TARGET_BUCKET` environment variable for your Firebase function. This determines where the uploaded file will be stored in Cloud Storage.

The Cloud Function extracts and separates metadata (`_firebaseFunction_fileName`, `_firebaseFunction_folderPrefix`) from the attribution payload before storing it.

---

## 🔥 Working with This Cloud Function Repo

This repo is designed to be deployed across **multiple Firebase projects**.

### 🚀 Getting Started

1. **Clone the Repo**

   ```bash
   git clone git@github.com:TechArtists/firebase-function-save-payloads.git
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
   ENFORCE_APP_CHECK=true
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
firebase functions:secrets:set ENFORCE_APP_CHECK
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
