const http = require('http');

const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Only PUT and POST supported\n');
  }

  console.log(`Incoming ${req.method} ${req.url}`);

  let totalBytes = 0;

  req.on('data', (chunk) => {
    totalBytes += chunk.length;
    // Do nothing with the chunk — just reading it drains the stream
  });

  req.on('end', () => {
    const formatter = new Intl.NumberFormat('en-US');

    const formatted = formatter.format(totalBytes);
    console.log(`Upload complete. Received ${formatted} bytes`);
    res.statusCode = 200;
    res.end(`Received ${formatted} bytes\n`);
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
    res.statusCode = 500;
    res.end('Request error\n');
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
