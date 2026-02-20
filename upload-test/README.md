# Streaming File Upload Memory Test

Tests that `fetch()` with a `FileSystem.File` body streams the file from disk
without loading it into memory. This validates the streaming upload implementation
in the expo fetch module.

## Setup

### 1. Install patched expo packages (optional)

To test changes from the `gmaclennan/expo` fork:

```bash
# In the expo monorepo, pack the modified packages:
cd /path/to/expo/packages/expo
npm pack --pack-destination /path/to/upload-test/

cd /path/to/expo/packages/expo-file-system
npm pack --pack-destination /path/to/upload-test/

# In this project, install the tarballs:
cd /path/to/upload-test
npm install ./expo-55.0.0-preview.11.tgz ./expo-file-system-55.0.6.tgz
```

Note: The `npm pack` in the expo monorepo requires `expo-module` CLI to be
available. Run `yarn install` in the monorepo root first, or temporarily
set the prepare script to `echo skipped` before packing.

### 2. Create the native build

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
# OR
npx expo run:android
```

### 3. Start the test server

```bash
node server.js
# or: npm run server
```

The server listens on port 3456 and provides:
- `GET /generate?size=N` — streams N bytes of random data (for creating test files)
- `PUT /upload` — accepts uploads, counts bytes, returns stats
- `GET /health` — health check

### 4. Run the app

```bash
npx expo start
```

Press the "Single Upload" button to:
1. Download a 500MB test file from the server to the device
2. Upload it back using `fetch()` with a `FileSystem.File` body
3. Display timing and server-reported stats

### 5. Monitor memory

While the upload is running, monitor the app's memory usage:

```bash
# Find the app PID
adb shell pidof com.uploadtest

# Watch memory (run repeatedly during upload)
adb shell dumpsys meminfo <pid> | grep "TOTAL"

# Or continuous monitoring:
while true; do
  adb shell dumpsys meminfo $(adb shell pidof com.uploadtest) 2>/dev/null | grep "TOTAL"
  sleep 2
done
```

**Expected result:** Native heap + Java heap should stay well below 500MB during
upload, confirming the file is streamed from disk rather than loaded into memory.

## How it works

The app uses the new expo-file-system `File` class to create a file-backed
`SharedObject`. When passed as the `body` of a `fetch()` call:

- **Android:** OkHttp's `File.asRequestBody()` streams the file via Okio
- **Android (content:// URIs):** A custom `ContentUriRequestBody` streams via
  `ContentResolver.openInputStream()`
- **iOS:** `URLSession.uploadTask(with:fromFile:)` streams from disk

In all cases, the file is never loaded entirely into JS or native memory.
