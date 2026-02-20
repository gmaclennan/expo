/**
 * Test server for streaming file upload memory test.
 *
 * Endpoints:
 *   GET  /generate?size=N   — Streams N bytes of random data (for creating test files)
 *   PUT  /upload             — Accepts a streaming upload, counts bytes, reports stats
 *   GET  /health             — Health check
 *
 * Usage:
 *   node server.js
 *   node server.js 3456          # custom port
 */

const http = require('http');
const crypto = require('crypto');
const url = require('url');

const PORT = parseInt(process.argv[2], 10) || 3456;
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for generation

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  // CORS for React Native
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Generate endpoint: streams N bytes of random data
  if (path === '/generate' && req.method === 'GET') {
    const size = parseInt(parsed.query.size, 10);
    if (!size || size <= 0) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing or invalid ?size= parameter');
      return;
    }

    console.log(`[generate] Streaming ${formatBytes(size)} of random data...`);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
    });

    let remaining = size;
    function writeChunk() {
      while (remaining > 0) {
        const chunkSize = Math.min(CHUNK_SIZE, remaining);
        const chunk = crypto.randomBytes(chunkSize);
        remaining -= chunkSize;
        if (!res.write(chunk)) {
          // Back-pressure: wait for drain
          res.once('drain', writeChunk);
          return;
        }
      }
      res.end();
      console.log(`[generate] Done streaming ${formatBytes(size)}`);
    }
    writeChunk();
    return;
  }

  // Upload endpoint: accepts body, counts bytes, reports stats
  if (path === '/upload' && (req.method === 'PUT' || req.method === 'POST')) {
    const contentLength = req.headers['content-length'];
    const contentType = req.headers['content-type'] || 'unknown';
    console.log(
      `[upload] ${req.method} started — Content-Type: ${contentType}, Content-Length: ${contentLength || 'unknown'}`
    );

    let bytesReceived = 0;
    let chunks = 0;
    const startTime = Date.now();
    let lastLogTime = startTime;

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      chunks++;

      // Log progress every 5 seconds
      const now = Date.now();
      if (now - lastLogTime > 5000) {
        const elapsed = ((now - startTime) / 1000).toFixed(1);
        const rate = (bytesReceived / (1024 * 1024) / ((now - startTime) / 1000)).toFixed(1);
        console.log(
          `[upload] Progress: ${formatBytes(bytesReceived)} in ${elapsed}s (${rate} MB/s)`
        );
        lastLogTime = now;
      }
    });

    req.on('end', () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate =
        elapsed > 0 ? (bytesReceived / (1024 * 1024) / parseFloat(elapsed)).toFixed(1) : '0';

      const result = JSON.stringify({
        success: true,
        bytesReceived,
        bytesFormatted: formatBytes(bytesReceived),
        chunks,
        elapsedSeconds: parseFloat(elapsed),
        rateMBps: parseFloat(rate),
        expectedBytes: contentLength ? parseInt(contentLength, 10) : null,
        match: contentLength ? bytesReceived === parseInt(contentLength, 10) : null,
      });

      console.log(`[upload] Complete: ${formatBytes(bytesReceived)} in ${elapsed}s (${rate} MB/s)`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(result);
    });

    req.on('error', (err) => {
      console.error(`[upload] Error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Upload error: ${err.message}`);
    });
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(`Not found: ${req.method} ${path}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nUpload test server listening on http://0.0.0.0:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  http://localhost:${PORT}/generate?size=524288000  (generate 500MB file)`);
  console.log(`  PUT  http://localhost:${PORT}/upload                   (accept upload)`);
  console.log(`  GET  http://localhost:${PORT}/health                   (health check)`);
  console.log(`\nFor Android emulator, the app uses http://10.0.2.2:${PORT}`);
  console.log('');
});
