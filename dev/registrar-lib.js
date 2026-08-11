/**
 * Logica compartida de validacion/dedup, igual a registrarComprobante de Code.gs,
 * usada por mock-backend.js y local-server.js.
 */
const fs = require('fs');

const CONFIG = {
  CUENTA_DESTINO: '0024',
  BENEFICIARIO_CLAVES: ['INDUYES', 'INDUSTRIA ALIMENTICIA YES'],
  VENTANA_HORAS: 36
};

function leerRegistro(dbFile) {
  try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) { return []; }
}
function guardarRegistro(dbFile, filas) {
  fs.writeFileSync(dbFile, JSON.stringify(filas, null, 2));
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

function registrarComprobante(dbFile, payload) {
  const d = payload.datos || {};
  const local = _validarServidor(d, payload.montoEsperado);
  if (local.veredicto === 'RECHAZADO') return { veredicto: 'RECHAZADO', motivos: local.motivos };

  const filas = leerRegistro(dbFile);
  const existente = filas.find(f =>
    (d.uuid && f.uuid === d.uuid) || (d.comprobante && String(f.comprobante) === String(d.comprobante)));
  if (existente) {
    filas.push({ registrado: new Date().toISOString(), vendedor: payload.vendedor || '', ...d, veredicto: 'DUPLICADO' });
    guardarRegistro(dbFile, filas);
    return { veredicto: 'DUPLICADO', motivos: ['Este comprobante ya fue usado (fila ' + filas.indexOf(existente) + ').'] };
  }
  filas.push({ registrado: new Date().toISOString(), vendedor: payload.vendedor || '', ...d, veredicto: local.veredicto });
  guardarRegistro(dbFile, filas);
  return { veredicto: local.veredicto, motivos: local.motivos, ok: true };
}

module.exports = { registrarComprobante };
