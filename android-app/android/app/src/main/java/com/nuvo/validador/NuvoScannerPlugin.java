package com.nuvo.validador;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
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

    // Abre un archivo (PDF/Excel guardado por guardarArchivoNativo() en
    // scanner.html) para VERLO, no para compartirlo -- Intent.ACTION_VIEW,
    // no ACTION_SEND. @capacitor/share solo sabe armar un cuadro de
    // "compartir con..." (Intent.ACTION_SEND): apps de mensajeria,
    // impresion, etc., nunca "abrir y mostrar en pantalla". Android abre
    // el visor de PDF que el usuario tenga configurado por defecto, o un
    // selector de "abrir con" si hay mas de uno instalado -- de cualquier
    // forma, el archivo se VE, no se manda a ningun lado. Reusa el mismo
    // FileProvider (mismo authority, mismo file_paths.xml) que ya usa
    // @capacitor/share para que la app externa pueda leer el archivo.
    @PluginMethod
    public void abrirArchivo(PluginCall call) {
        String path = call.getString("path");
        String mimeType = call.getString("mimeType", "*/*");
        if (path == null) {
            call.reject("Falta la ruta del archivo");
            return;
        }
        try {
            File archivo = new File(Uri.parse(path).getPath());
            Uri uriCompartible = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                archivo
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uriCompartible, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (ActivityNotFoundException e) {
            call.reject("No hay ninguna app instalada que pueda abrir este archivo");
        } catch (Exception e) {
            call.reject("No se pudo abrir el archivo: " + e.getMessage());
        }
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
