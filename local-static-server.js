const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const distDir = path.join(__dirname, 'dist');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

function send404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Not Found');
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURI(req.url.split('?')[0]);
    // Prevent path traversal
    if (urlPath.includes('..')) {
      send404(res);
      return;
    }

    let filePath = path.join(distDir, urlPath);

    fs.stat(filePath, (err, stats) => {
      if (err) {
        // try index.html inside folder
        const indexPath = path.join(filePath, 'index.html');
        fs.stat(indexPath, (err2, stats2) => {
          if (err2) return send404(res);
          streamFile(indexPath, res);
        });
        return;
      }

      if (stats.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        fs.stat(indexPath, (err3) => {
          if (err3) return send404(res);
          streamFile(indexPath, res);
        });
        return;
      }

      streamFile(filePath, res);
    });
  } catch (e) {
    res.statusCode = 500;
    res.end('500');
  }
});

function streamFile(p, res) {
  const ext = path.extname(p).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  const isText = type.startsWith('text/') || type === 'application/javascript' || type === 'application/json';
  res.setHeader('Content-Type', type + (isText ? '; charset=UTF-8' : ''));
  const stream = fs.createReadStream(p);
  stream.on('error', () => { res.statusCode = 500; res.end('500'); });
  stream.pipe(res);
}

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port} serving ${distDir}`);
});
