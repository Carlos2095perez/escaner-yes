/**
 * Sistema YES · INDUYES — Validador de Comprobantes (2 archivos, todo en GAS)
 * Archivos:  Codigo.gs  +  Index.html
 *
 * SETUP:
 *  1. Pega el ID de tu Sheet en SHEET_ID.
 *  2. Deploy > New deployment > Web app > Execute as: TÚ > Who has access: Anyone.
 *  3. Abre la URL /exec en el celular. Cada vendedor entra con  /exec?v=006
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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('YES · Verificar comprobante')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}

function getConfig() { return CONFIG; }

// Valida (cuenta/beneficiario/monto opcional/recencia). montoEsperado es opcional.
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
    return { veredicto: 'ALERTA', motivos: ['El comprobante tiene ' + horas.toFixed(0) + ' horas. Revisar.'] };

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

/**
 * Punto único que llama el front (google.script.run):
 * valida + dedup autoritativo + registra. Devuelve el veredicto.
 * payload = { datos, vendedor, montoEsperado? }
 */
function registrarComprobante(payload) {
  const d = payload.datos || {};

  // 1) Validación autoritativa
  const local = _validarServidor(d, payload.montoEsperado);
  if (local.veredicto === 'RECHAZADO') {
    return { veredicto: 'RECHAZADO', motivos: local.motivos };
  }

  // 2) Dedup + registro (con Lock para carreras)
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
