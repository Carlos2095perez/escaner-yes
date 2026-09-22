package com.nuvo.validador;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente para la integracion con "Cierre de caja" (otra app -- repo
// facturacion-pos-movil, ver el intent-filter nuevo en AndroidManifest.xml):
// cuando esa app abre NUVO via
// "intent://escanear#Intent;scheme=nuvo;package=com.nuvo.validador;end",
// el JS necesita saber que arranco asi, para ir directo a escanear y
// mostrar el boton extra "Enviar a Cierre de caja" en el resultado. Esto
// NO manda ni recibe ningun dato del comprobante en la ida -- solo la
// señal de "vengo de esa integracion". Los datos del comprobante van
// aparte, en la vuelta (scanner.html navega el WebView a la URL de
// Cierre de caja con los datos como query params).
@CapacitorPlugin(name = "NuvoDeepLink")
public class NuvoDeepLinkPlugin extends Plugin {
    private boolean modoIntegracionPendiente = false;

    private boolean esLinkDeEscaneo(Intent intent) {
        if (intent == null) return false;
        Uri data = intent.getData();
        return data != null && "nuvo".equals(data.getScheme()) && "escanear".equals(data.getHost());
    }

    // Arranque en frio: la app no existia en memoria, Android crea la
    // Activity con el intent de "Cierre de caja" como intent inicial.
    @Override
    public void load() {
        if (getActivity() != null && esLinkDeEscaneo(getActivity().getIntent())) {
            modoIntegracionPendiente = true;
        }
    }

    // launchMode="singleTask" (ver AndroidManifest.xml): si NUVO ya estaba
    // abierta en segundo plano, Android reusa la misma Activity y el
    // nuevo intent llega aca en vez de por load() -- sin esto, reabrir la
    // app ya abierta desde "Cierre de caja" no activaria el modo
    // integracion.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (esLinkDeEscaneo(intent)) {
            modoIntegracionPendiente = true;
            JSObject data = new JSObject();
            data.put("modoIntegracion", true);
            notifyListeners("deepLink", data);
        }
    }

    // El JS la llama una vez al arrancar para saber si debe entrar en
    // "modo integracion". Se consume (se apaga la bandera) al leerla, para
    // que un refresh o volver a abrir la app despues no quede pegado en
    // ese modo para siempre.
    @PluginMethod
    public void getLaunchData(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("modoIntegracion", modoIntegracionPendiente);
        modoIntegracionPendiente = false;
        call.resolve(ret);
    }
}
