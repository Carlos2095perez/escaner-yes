/**
 * Servidor local combinado (estatico + API) para probar scanner.local.html
 * desde OTRO dispositivo (p. ej. tu celular) usando un tunel HTTPS
 * (localtunnel, cloudflared, ngrok, etc.) hacia UN solo puerto.
 *
 * Sirve los archivos del repo por GET y responde POST /api con la misma
 * logica de validacion/dedup de Code.gs.
 *
 * Uso: node dev/local-server.js [puerto]
 * Por defecto escucha en el puerto 8080.
 * Abre: http://localhost:8080/dev/scanner.local.html?v=009&monto=200.50
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { registrarComprobante } = require('./registrar-lib');

const PORT = Number(process.argv[2]) || 8080;
const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(__dirname, 'registro.local.json');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body);
        const r = registrarComprobante(DB_FILE, payload);
        res.writeHead(200);
        res.end(JSON.stringify(r));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ veredicto: 'ERROR', motivos: [String(err)] }));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    const urlPath = req.url === '/' ? '/dev/scanner.local.html' : decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('No encontrado'); }
      res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => console.log('Servidor local YES escuchando en http://localhost:' + PORT));
