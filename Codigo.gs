/**
 * Sistema YES · INDUYES — Validador de Comprobantes (2 archivos, todo en GAS)
 * Archivos:  Codigo.gs  +  Index.html
 *
 * SETUP:
 *  1. Pega el ID de tu Sheet en SHEET_ID.
 *  2. Pega tu correo en CONFIG.EMAIL_CONCILIACION (recibe el resumen diario).
 *  3. Deploy > New deployment > Web app > Execute as: TÚ > Who has access: Anyone.
 *  4. Abre la URL /exec en el celular. Cada vendedor entra con  /exec?v=006
 *  5. En el editor de Apps Script, selecciona la funcion crearTriggerDiario
 *     y dale Run UNA SOLA VEZ (activa el correo diario de conciliacion).
 *     La primera vez Google va a pedir autorizar permisos de Drive y Correo.
 */

const SHEET_ID = 'PEGA_AQUI_EL_ID_DEL_SHEET';
const HOJA = 'REGISTRO_COMPROBANTES';

const CONFIG = {
  // La cuenta destino viene ENMASCARADA dentro del propio QR (ej. "******0024"):
  // el banco/DeUna nunca expone el numero completo. Solo se puede exigir el sufijo visible.
  CUENTA_DESTINO_SUFIJO: '0024',
  BENEFICIARIO_CLAVES: ['INDUYES', 'INDUSTRIA ALIMENTICIA YES'],
  VENTANA_HORAS: 36,
  // Si una cuenta origen acumula este numero de comprobantes RECHAZADO/DUPLICADO
  // en el historial, los siguientes comprobantes de esa misma cuenta se marcan ALERTA.
  UMBRAL_LISTA_NEGRA: 2,
  // Correo que recibe el resumen diario de comprobantes pendientes de conciliar.
  EMAIL_CONCILIACION: 'PEGA_AQUI_TU_CORREO@gmail.com'
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
    return { veredicto: 'ALERTA', motivos: ['El comprobante fue hecho ' + _tiempoRelativo(ts) + '. Revisar antes de despachar.'] };

  return { veredicto: 'PENDIENTE_CONCILIACION', motivos: ['Comprobante consistente hacia INDUYES.'] };
}

// Indices de columnas en la hoja (0-based), usados por dedup y lista negra.
const COL = {
  REGISTRADO: 0, VENDEDOR: 1, MONTO: 2, UUID: 3, COMPROBANTE: 4,
  CTA_DESTINO: 5, CTA_ORIGEN: 6, BENEFICIARIO: 7, ORDENANTE: 8,
  FECHA_QR: 9, VEREDICTO: 10, MOTIVOS: 11, FOTO_URL: 12
};

function _hoja() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    sh.appendRow(['Registrado', 'Vendedor', 'MontoQR', 'UUID', 'Comprobante',
                  'CuentaDestino', 'CuentaOrigen', 'Beneficiario', 'Ordenante',
                  'FechaQR', 'Veredicto', 'Motivos', 'FotoURL']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Carpeta de Drive donde se guardan las fotos de evidencia de cada escaneo aceptado.
function _carpetaFotos() {
  const NOMBRE = 'YES Comprobantes - Fotos';
  const it = DriveApp.getFoldersByName(NOMBRE);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(NOMBRE);
}

// Sube la foto (dataURL base64 que manda el navegador) a Drive y devuelve su URL.
// Si no viene foto o falla la subida, devuelve '' sin romper el flujo de validacion.
function _guardarFoto(fotoDataUrl, nombreBase) {
  if (!fotoDataUrl) return '';
  try {
    const match = /^data:(image\/\w+);base64,(.*)$/.exec(fotoDataUrl);
    if (!match) return '';
    const bytes = Utilities.base64Decode(match[2]);
    const blob = Utilities.newBlob(bytes, match[1], 'comprobante_' + nombreBase + '.jpg');
    const file = _carpetaFotos().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}

// Cuenta cuantos comprobantes RECHAZADO/DUPLICADO tiene ya esa cuenta origen en el historial.
function _historialSospechoso(data, ctaOrigen) {
  if (!ctaOrigen) return 0;
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.CTA_ORIGEN] === ctaOrigen &&
        (data[i][COL.VEREDICTO] === 'RECHAZADO' || data[i][COL.VEREDICTO] === 'DUPLICADO')) {
      n++;
    }
  }
  return n;
}

/**
 * Punto único que llama el front (google.script.run):
 * valida + dedup + lista negra + registra (incluye rechazos, para poder auditarlos
 * y para que la lista negra funcione). payload = { datos, vendedor, montoEsperado?, foto? }
 */
function registrarComprobante(payload) {
  const d = payload.datos || {};
  const local = _validarServidor(d, payload.montoEsperado);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _hoja();
    const data = sh.getDataRange().getValues();

    if (local.veredicto === 'RECHAZADO') {
      sh.appendRow([new Date(), payload.vendedor || '', d.monto, d.uuid, d.comprobante,
                    d.ctaDestino, d.ctaOrigen, d.beneficiario, d.ordenante,
                    d.timestamp ? new Date(d.timestamp) : '', 'RECHAZADO', local.motivos.join(' | '), '']);
      return { veredicto: 'RECHAZADO', motivos: local.motivos };
    }

    const mismoComp = d.comprobante && data.some((f, i) => i > 0 && String(f[COL.COMPROBANTE]) === String(d.comprobante));
    const mismoUUID = d.uuid && data.some((f, i) => i > 0 && f[COL.UUID] === d.uuid);
    if (mismoUUID || mismoComp) {
      sh.appendRow([new Date(), payload.vendedor || '', d.monto, d.uuid, d.comprobante,
                    d.ctaDestino, d.ctaOrigen, d.beneficiario, d.ordenante,
                    d.timestamp ? new Date(d.timestamp) : '', 'DUPLICADO', 'Ya existia en el registro', '']);
      return { veredicto: 'DUPLICADO', motivos: ['Este comprobante ya fue usado.'] };
    }

    // Lista negra: cuenta origen con historial de rechazos/duplicados.
    let veredictoFinal = local.veredicto;
    let motivosFinal = local.motivos.slice();
    const sospechas = _historialSospechoso(data, d.ctaOrigen);
    if (sospechas >= CONFIG.UMBRAL_LISTA_NEGRA) {
      veredictoFinal = 'ALERTA';
      motivosFinal.push('Esta cuenta origen tiene ' + sospechas + ' comprobantes rechazados o duplicados anteriores. Revisar con cuidado.');
    }

    const fotoUrl = _guardarFoto(payload.foto, d.comprobante || d.uuid || 'sn');
    sh.appendRow([new Date(), payload.vendedor || '', d.monto, d.uuid, d.comprobante,
                  d.ctaDestino, d.ctaOrigen, d.beneficiario, d.ordenante,
                  d.timestamp ? new Date(d.timestamp) : '', veredictoFinal, motivosFinal.join(' | '), fotoUrl]);
    return { veredicto: veredictoFinal, motivos: motivosFinal, ok: veredictoFinal !== 'RECHAZADO' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Envia un correo con los comprobantes PENDIENTE_CONCILIACION/ALERTA de las
 * ultimas 24h que aun no se han marcado como conciliados. Pensada para correr
 * una vez al dia via trigger (ver crearTriggerDiario).
 */
function enviarResumenDiario() {
  const sh = _hoja();
  const data = sh.getDataRange().getValues();
  const desde = Date.now() - 24 * 3600 * 1000;
  const pendientes = [];
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const veredicto = fila[COL.VEREDICTO];
    const registrado = fila[COL.REGISTRADO] instanceof Date ? fila[COL.REGISTRADO].getTime() : 0;
    if ((veredicto === 'PENDIENTE_CONCILIACION' || veredicto === 'ALERTA') && registrado >= desde) {
      pendientes.push(fila);
    }
  }
  if (!pendientes.length) return;

  const tz = Session.getScriptTimeZone();
  let cuerpo = 'Comprobantes de las ultimas 24h pendientes de conciliar con el banco (' + pendientes.length + '):\n\n';
  pendientes.forEach(fila => {
    cuerpo += '- ' + Utilities.formatDate(fila[COL.REGISTRADO], tz, 'dd/MM HH:mm') +
      ' | $' + fila[COL.MONTO] + ' | Comprobante ' + fila[COL.COMPROBANTE] +
      ' | Vendedor ' + fila[COL.VENDEDOR] + ' | ' + fila[COL.VEREDICTO] + '\n';
  });
  cuerpo += '\nRevisa la hoja "' + HOJA + '" contra el estado de cuenta del banco.';

  MailApp.sendEmail(CONFIG.EMAIL_CONCILIACION, 'YES · Comprobantes pendientes de conciliar (' + pendientes.length + ')', cuerpo);
}

/**
 * Ejecutar UNA SOLA VEZ desde el editor de Apps Script (seleccionar esta funcion
 * y darle Run) para activar el correo diario de conciliacion. No hace falta
 * volver a correrla despues de cada deploy.
 */
function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enviarResumenDiario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarResumenDiario').timeBased().everyDays(1).atHour(19).create();
}
