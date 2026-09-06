// Worker de decodificado QR: se usa SOLO como respaldo cuando el navegador
// no tiene BarcodeDetector nativo. Corre jsQR fuera del hilo principal --
// el hilo principal le manda una imagen ya reducida (~400px de ancho, ver
// ANCHO_WORKER en scanner.html) y espera el resultado por mensaje, sin
// bloquearse en ningun momento mientras jsQR trabaja.
importScripts('jsQR.js');

onmessage = function(e){
  const { data, width, height } = e.data;
  let texto = null;
  try{
    const resultado = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    if(resultado && resultado.data) texto = resultado.data;
  }catch(err){
    // Un frame raro que le hace tropezar a jsQR no puede tumbar el worker
    // ni dejar al hilo principal esperando para siempre -- se responde
    // "no encontrado" y el ciclo de decodificado sigue en el proximo turno.
  }
  postMessage({ texto });
};
