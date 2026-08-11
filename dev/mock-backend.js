/**
 * Backend local de prueba — replica la lógica de Code.gs (registrarComprobante)
 * usando un archivo JSON en vez del Google Sheet, para poder probar scanner.html
 * sin necesidad de desplegar en Google Apps Script.
 *
 * Uso: node dev/mock-backend.js [puerto]
 * Por defecto escucha en el puerto 8787.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8787;
const DB_FILE = path.join(__dirname, 'registro.local.json');

const CONFIG = {
  CUENTA_DESTINO: '0024',
  BENEFICIARIO_CLAVES: ['INDUYES', 'INDUSTRIA ALIMENTICIA YES'],
  VENTANA_HORAS: 36
};

function leerRegistro() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return []; }
}
function guardarRegistro(filas) {
  fs.writeFileSync(DB_FILE, JSON.stringify(filas, null, 2));
}

function _validarServidor(d, montoEsperado) {
  const m = [];
  if (!d) return { veredicto: 'RECHAZADO', motivos: ['No se pudo leer el QR.'] };
  if (!String(d.ctaDestino || '').endsWith(CONFIG.CUENTA_DESTINO))
    m.push('La cuenta destino no es INDUYES (...' + String(d.ctaDestino).slice(-4) + ').');
  const benef = String(d.beneficiario || '').toUpperCase();
  if (!CONFIG.BENEFICIARIO_CLAVES.some(k => benef.indexOf(k) >= 0))
    m.push('El beneficiario no es INDUYES.');
  if (montoEsperado && Number(montoEsperado) > 0 &&
      Math.abs(Number(d.monto) - Number(montoEsperado)) > 0.001)
    m.push('El monto no coincide con la factura.');
  if (m.length) return { veredicto: 'RECHAZADO', motivos: m };

  const horas = (Date.now() - Number(d.timestamp)) / 3.6e6;
  if (horas > CONFIG.VENTANA_HORAS)
    return { veredicto: 'ALERTA', motivos: ['El comprobante tiene ' + horas.toFixed(0) + ' horas. Revisar.'] };

  return { veredicto: 'PENDIENTE_CONCILIACION', motivos: ['Comprobante consistente hacia INDUYES.'] };
}

function registrarComprobante(payload) {
  const d = payload.datos || {};
  const local = _validarServidor(d, payload.montoEsperado);
  if (local.veredicto === 'RECHAZADO') return { veredicto: 'RECHAZADO', motivos: local.motivos };

  const filas = leerRegistro();
  const existente = filas.find(f =>
    (d.uuid && f.uuid === d.uuid) || (d.comprobante && String(f.comprobante) === String(d.comprobante)));
  if (existente) {
    filas.push({ registrado: new Date().toISOString(), vendedor: payload.vendedor || '', ...d, veredicto: 'DUPLICADO' });
    guardarRegistro(filas);
    return { veredicto: 'DUPLICADO', motivos: ['Este comprobante ya fue usado (fila ' + filas.indexOf(existente) + ').'] };
  }
  filas.push({ registrado: new Date().toISOString(), vendedor: payload.vendedor || '', ...d, veredicto: local.veredicto });
  guardarRegistro(filas);
  return { veredicto: local.veredicto, motivos: local.motivos, ok: true };
}

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
        const r = registrarComprobante(payload);
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
