package com.nuvo.validador;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente entre el JavaScript de la app y el servicio nativo en segundo
// plano (NuvoScannerService). Por ahora solo deja arrancar/parar el
// servicio y probar la alerta de voz, para confirmar que Android de
// verdad lo deja vivo en segundo plano ANTES de conectar el lector
// Bluetooth real -- eso se agrega en el siguiente paso, cuando el lector
// fisico este disponible.
@CapacitorPlugin(name = "NuvoScanner")
public class NuvoScannerPlugin extends Plugin {

    @PluginMethod
    public void iniciar(PluginCall call) {
        Intent intent = new Intent(getContext(), NuvoScannerService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void detener(PluginCall call) {
        Intent intent = new Intent(getContext(), NuvoScannerService.class);
        intent.setAction(NuvoScannerService.ACTION_STOP);
        getContext().startService(intent);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void probarAlerta(PluginCall call) {
        String texto = call.getString("texto", "Comprobante aceptado, noventa y tres con cuarenta y tres dólares.");
        Intent intent = new Intent(getContext(), NuvoScannerService.class);
        intent.setAction(NuvoScannerService.ACTION_SPEAK);
        intent.putExtra(NuvoScannerService.EXTRA_TEXT, texto);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
