/**
 * Backend local de prueba — replica registrarComprobante de Code.gs
 * usando un archivo JSON en vez del Google Sheet, para poder probar scanner.html
 * sin necesidad de desplegar en Google Apps Script.
 *
 * Uso: node dev/mock-backend.js [puerto]
 * Por defecto escucha en el puerto 8787.
 */
const http = require('http');
const path = require('path');
const { registrarComprobante } = require('./registrar-lib');

const PORT = Number(process.argv[2]) || 8787;
const DB_FILE = path.join(__dirname, 'registro.local.json');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    return res.end('<h2>Mock backend YES activo (puerto ' + PORT + ')</h2>');
  }

  if (req.method === 'POST') {
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

  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => console.log('Mock backend YES escuchando en http://localhost:' + PORT));
