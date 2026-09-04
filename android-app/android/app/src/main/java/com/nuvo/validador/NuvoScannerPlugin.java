package com.nuvo.validador;

import android.content.Intent;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

// Puente entre el JavaScript de la app y el servicio nativo en segundo
// plano (NuvoScannerService). iniciar/detener/probarAlerta son para el modo
// en segundo plano (arrancan el Servicio en Primer Plano, con su
// notificacion fija -- ver NuvoScannerService). hablar() es distinto: es el
// aviso de voz de cada escaneo normal, con la app en primer plano, asi que
// NO necesita el servicio ni su notificacion -- solo TextToSpeech nativo
// directo. Existe porque el WebView de Android no implementa la Web Speech
// API del navegador (speechSynthesis no esta definido ahi), asi que el
// aviso hablado tiene que salir por el lado nativo para sonar de verdad
// dentro de la app empaquetada.
@CapacitorPlugin(name = "NuvoScanner")
public class NuvoScannerPlugin extends Plugin {
    private TextToSpeech ttsDirecto;
    private boolean ttsDirectoListo = false;
    private String textoPendiente = null;

    private void asegurarTtsDirecto() {
        if (ttsDirecto != null) return;
        ttsDirecto = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS && ttsDirecto != null) {
                ttsDirecto.setLanguage(new Locale("es", "EC"));
                ttsDirectoListo = true;
                if (textoPendiente != null) {
                    ttsDirecto.speak(textoPendiente, TextToSpeech.QUEUE_FLUSH, null, "nuvo_alerta_directa");
                    textoPendiente = null;
                }
            }
        });
    }

    // Habla un texto de inmediato via TTS nativo de Android -- lo usa
    // hablar()/hablarRechazo() en scanner.html en vez de la Web Speech API,
    // que no existe en este WebView. Si el motor de TTS todavia se esta
    // inicializando (primera llamada desde que arranco la app), el texto
    // queda pendiente y se habla apenas termine, en vez de perderse.
    @PluginMethod
    public void hablar(PluginCall call) {
        String texto = call.getString("texto", "");
        if (texto == null || texto.isEmpty()) {
            call.reject("Falta el texto a hablar");
            return;
        }
        asegurarTtsDirecto();
        if (ttsDirectoListo) {
            ttsDirecto.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "nuvo_alerta_directa");
        } else {
            textoPendiente = texto;
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (ttsDirecto != null) { ttsDirecto.stop(); ttsDirecto.shutdown(); ttsDirecto = null; }
        super.handleOnDestroy();
    }

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
