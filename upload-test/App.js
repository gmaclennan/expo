import { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';

const FILE_SIZE_MB = 500;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Default server URL: 10.0.2.2 is the host machine from Android emulator
const DEFAULT_SERVER =
  Platform.OS === 'android' ? 'http://10.0.2.2:3456' : 'http://localhost:3456';

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef(null);

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLog((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Step 1: Download a generated file from the test server.
  // The server streams random bytes, so the device never holds the whole
  // payload in JS memory during generation.
  const ensureTestFile = useCallback(async () => {
    const filePath = FileSystem.documentDirectory + 'test-upload.bin';
    const sizeBytes = FILE_SIZE_MB * 1024 * 1024;

    // Check if file already exists with correct size
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists && info.size === sizeBytes) {
      addLog(`Reusing existing test file (${formatBytes(info.size)})`);
      return filePath;
    }
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }

    addLog(`Downloading ${FILE_SIZE_MB}MB test file from server...`);
    const t0 = Date.now();
    const result = await FileSystem.downloadAsync(
      `${serverUrl}/generate?size=${sizeBytes}`,
      filePath
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const finalInfo = await FileSystem.getInfoAsync(filePath);
    addLog(`File ready: ${formatBytes(finalInfo.size)} in ${elapsed}s (status ${result.status})`);
    return filePath;
  }, [serverUrl, addLog]);

  // Step 2: Upload the file using fetch() with a File body (streaming).
  const uploadFile = useCallback(
    async (filePath, label) => {
      const file = new FileSystem.File(filePath);
      addLog(`${label} — File: ${file.uri}`);
      addLog(`${label} — Size: ${formatBytes(file.size)}, Type: ${file.type || 'application/octet-stream'}`);

      const t0 = Date.now();
      const response = await fetch(`${serverUrl}/upload`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const body = await response.text();

      addLog(`${label} — Done: ${response.status} in ${elapsed}s`);
      addLog(`${label} — Server says: ${body.substring(0, 300)}`);
      return { elapsed, status: response.status };
    },
    [serverUrl, addLog]
  );

  // Main test: single upload
  const runSingleUpload = useCallback(async () => {
    setRunning(true);
    setLog([]);
    try {
      addLog('=== Streaming File Upload Test ===');
      addLog(`Server: ${serverUrl}`);
      addLog('');
      addLog('While this runs, monitor memory on the host:');
      addLog('  adb shell dumpsys meminfo <pid> | grep "TOTAL"');
      addLog('  adb shell cat /proc/<pid>/status | grep VmRSS');
      addLog('');

      const filePath = await ensureTestFile();
      await uploadFile(filePath, 'Upload');

      addLog('');
      addLog('=== Test Complete ===');
      addLog(`If native memory stayed well under ${FILE_SIZE_MB}MB above`);
      addLog('baseline, then streaming upload is working correctly.');
    } catch (error) {
      addLog(`ERROR: ${error.message}`);
      if (error.stack) addLog(error.stack.substring(0, 400));
    } finally {
      setRunning(false);
    }
  }, [serverUrl, addLog, ensureTestFile, uploadFile]);

  // Memory leak test: 3 sequential uploads
  const runSequentialUploads = useCallback(async () => {
    setRunning(true);
    setLog([]);
    try {
      addLog('=== Sequential Upload Memory Leak Test ===');
      addLog(`Server: ${serverUrl}`);
      addLog('Monitor memory between uploads to detect leaks.');
      addLog('');

      const filePath = await ensureTestFile();

      for (let i = 1; i <= 3; i++) {
        addLog(`\n--- Round ${i}/3 ---`);
        addLog('(Check memory now with adb dumpsys meminfo)');
        await uploadFile(filePath, `Upload ${i}`);
        // Brief pause so GC can run and you can sample memory
        await new Promise((r) => setTimeout(r, 2000));
      }

      addLog('\n=== Sequential Test Complete ===');
      addLog('Compare memory across rounds — it should stay roughly flat.');
    } catch (error) {
      addLog(`ERROR: ${error.message}`);
      if (error.stack) addLog(error.stack.substring(0, 400));
    } finally {
      setRunning(false);
    }
  }, [serverUrl, addLog, ensureTestFile, uploadFile]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Streaming Upload Test</Text>

      <View style={styles.inputRow}>
        <Text style={styles.label}>Server:</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder={DEFAULT_SERVER}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.btn, running && styles.btnDisabled]}
          onPress={runSingleUpload}
          disabled={running}
        >
          <Text style={styles.btnText}>Single Upload</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, running && styles.btnDisabled]}
          onPress={runSequentialUploads}
          disabled={running}
        >
          <Text style={styles.btnText}>3x Sequential</Text>
        </Pressable>
      </View>

      {running && <Text style={styles.running}>Running...</Text>}

      <ScrollView
        ref={scrollRef}
        style={styles.logContainer}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
        {log.length === 0 && (
          <Text style={styles.logHint}>
            {'Start the test server first:\n  node server.js\n\nThen press a button above.'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginRight: 8,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#fff',
    backgroundColor: '#1a1a2e',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {
    backgroundColor: '#555',
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  running: {
    textAlign: 'center',
    color: '#007AFF',
    marginBottom: 8,
    fontWeight: '600',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  logLine: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
  logHint: {
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 20,
  },
});
