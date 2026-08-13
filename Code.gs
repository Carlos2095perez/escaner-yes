/**
 * Sistema YES · INDUYES — Validador de Comprobantes (backend)
 *   - doGet()  -> pantalla de estado (confirma que el deploy vive)
 *   - doPost() -> lo llama scanner.html (lector EN VIVO, alojado en GitHub Pages)
 *
 * SETUP:
 *  1. Pega el ID de tu Sheet en SHEET_ID.
 *  2. Deploy > Manage deployments > editar (lapiz) > New version > Deploy.
 *  3. Copia la URL /exec y pegala en scanner.html (GAS_URL).
 */

const SHEET_ID = 'PEGA_AQUI_EL_ID_DEL_SHEET';
const HOJA = 'REGISTRO_COMPROBANTES';

const CONFIG = {
  // La cuenta destino viene ENMASCARADA dentro del propio QR (ej. "******0024"):
  // el banco/DeUna nunca expone el numero completo. Solo se puede exigir el sufijo visible.
  CUENTA_DESTINO_SUFIJO: '0024',
  BENEFICIARIO_CLAVES: ['INDUYES', 'INDUSTRIA ALIMENTICIA YES'],
  VENTANA_HORAS: 36
};

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_HASH = /^[0-9a-f]{16,}$/i;
const RE_COMPROBANTE = /^[0-9A-Za-z]{5,}$/;

// Formatea una fecha pasada como texto relativo legible: "hace 1 minuto", "hace 5 horas", etc.
function _tiempoRelativo(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'hace unos segundos';
  if (min === 1) return 'hace 1 minuto';
  if (min < 60) return 'hace ' + min + ' minutos';
  const horas = Math.round(min / 60);
  if (horas === 1) return 'hace 1 hora';
  if (horas < 24) return 'hace ' + horas + ' horas';
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : 'hace ' + dias + ' días';
}

function doGet() {
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:system-ui;text-align:center;padding:60px 24px;color:#0A0B0D">' +
    '<div style="width:64px;height:64px;border-radius:18px;background:#FFDD00;margin:0 auto 20px;' +
    'display:grid;place-items:center;font-weight:800;font-size:28px">Y</div>' +
    '<h2 style="margin:0 0 8px">Validador YES activo</h2>' +
    '<p style="color:#777">El backend responde. El escaneo en vivo se hace desde scanner.html.</p></div>'
  ).setTitle('YES · Validador');
}

// El lector en vivo (externo) hace POST aqui. text/plain evita el preflight CORS.
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const r = registrarComprobante(payload);
    return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ veredicto: 'ERROR', motivos: [String(err)] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getConfig() { return CONFIG; }

function _validarServidor(d, montoEsperado) {
  const m = [];
  if (!d) return { veredicto: 'RECHAZADO', motivos: ['No se pudo leer el QR.'] };
  if (!String(d.ctaDestino || '').endsWith(CONFIG.CUENTA_DESTINO_SUFIJO))
    m.push('La cuenta destino no es INDUYES (...' + String(d.ctaDestino).slice(-4) + ').');
  const benef = String(d.beneficiario || '').toUpperCase();
  if (!CONFIG.BENEFICIARIO_CLAVES.some(k => benef.indexOf(k) >= 0))
    m.push('El beneficiario no es INDUYES.');
  if (montoEsperado && Number(montoEsperado) > 0 &&
      Math.abs(Number(d.monto) - Number(montoEsperado)) > 0.001)
    m.push('El monto no coincide con la factura.');
  if (!(Number(d.monto) > 0))
    m.push('El monto del QR no es válido.');
  if (!RE_UUID.test(String(d.uuid || '')))
    m.push('El QR no tiene un formato de comprobante válido (ID de transacción).');
  if (!RE_HASH.test(String(d.hash || '')))
    m.push('El QR no tiene un formato de comprobante válido (firma).');
  if (!String(d.ctaOrigen || '').trim())
    m.push('El QR no tiene un formato de comprobante válido (cuenta origen).');
  if (!RE_COMPROBANTE.test(String(d.comprobante || '')))
    m.push('El QR no tiene un formato de comprobante válido (N° comprobante).');
  const ts = Number(d.timestamp);
  if (!ts || ts > Date.now() + 5 * 60 * 1000)
    m.push('La fecha del comprobante no es válida.');
  if (m.length) return { veredicto: 'RECHAZADO', motivos: m };

  const horas = (Date.now() - ts) / 3.6e6;
  if (horas > CONFIG.VENTANA_HORAS)
    return { veredicto: 'ALERTA', motivos: ['El comprobante fue hecho ' + _tiempoRelativo(ts) + '. Revisar antes de despachar.'] };

  return { veredicto: 'PENDIENTE_CONCILIACION', motivos: ['Comprobante consistente hacia INDUYES.'] };
}

function _hoja() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    sh.appendRow(['Registrado', 'Vendedor', 'MontoQR', 'UUID', 'Comprobante',
                  'CuentaDestino', 'Beneficiario', 'Ordenante', 'FechaQR', 'Veredicto', 'Motivos']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Valida + dedup autoritativo + registra. payload = { datos, vendedor, montoEsperado? }
function registrarComprobante(payload) {
  const d = payload.datos || {};
  const local = _validarServidor(d, payload.montoEsperado);
  if (local.veredicto === 'RECHAZADO') return { veredicto: 'RECHAZADO', motivos: local.motivos };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _hoja();
    const data = sh.getDataRange().getValues();
    const I_UUID = 3, I_COMP = 4;
    for (let i = 1; i < data.length; i++) {
      const mismoUUID = d.uuid && data[i][I_UUID] === d.uuid;
      const mismoComp = d.comprobante && String(data[i][I_COMP]) === String(d.comprobante);
      if (mismoUUID || mismoComp) {
        sh.appendRow([new Date(), payload.vendedor || '', d.monto, d.uuid, d.comprobante,
                      d.ctaDestino, d.beneficiario, d.ordenante,
                      d.timestamp ? new Date(d.timestamp) : '', 'DUPLICADO', 'Ya existia en fila ' + (i + 1)]);
        return { veredicto: 'DUPLICADO', motivos: ['Este comprobante ya fue usado (fila ' + (i + 1) + ').'] };
      }
    }
    sh.appendRow([new Date(), payload.vendedor || '', d.monto, d.uuid, d.comprobante,
                  d.ctaDestino, d.beneficiario, d.ordenante,
                  d.timestamp ? new Date(d.timestamp) : '', local.veredicto, local.motivos.join(' | ')]);
    return { veredicto: local.veredicto, motivos: local.motivos, ok: true };
  } finally {
    lock.releaseLock();
  }
}
