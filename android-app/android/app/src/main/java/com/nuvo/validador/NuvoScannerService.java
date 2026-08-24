package com.nuvo.validador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import androidx.core.app.NotificationCompat;
import java.util.Locale;

// Servicio en primer plano: es lo unico que Android deja seguir corriendo
// aunque el usuario este en otra app (TikTok, etc.), a cambio de mostrar
// una notificacion fija y visible en todo momento -- ese es el trato que
// exige el sistema operativo, no se puede evitar ni ocultar.
//
// Por ahora este servicio SOLO prueba que la alerta de voz funciona en
// segundo plano (llamado desde el boton de prueba en la app). La conexion
// real al lector Bluetooth (SPP/BLE) se agrega despues, cuando el lector
// fisico este disponible para probar contra el dispositivo real.
public class NuvoScannerService extends Service {
    public static final String ACTION_SPEAK = "com.nuvo.validador.SPEAK";
    public static final String ACTION_STOP = "com.nuvo.validador.STOP";
    public static final String EXTRA_TEXT = "texto";

    private static final String CHANNEL_ID = "nuvo_scanner_channel";
    private static final int NOTIF_ID = 4821;

    private TextToSpeech tts;
    private boolean ttsListo = false;

    @Override
    public void onCreate() {
        super.onCreate();
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS && tts != null) {
                tts.setLanguage(new Locale("es", "EC"));
                ttsListo = true;
            }
        });
        crearCanalNotificacion();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, construirNotificacion());
        if (intent != null) {
            String accion = intent.getAction();
            if (ACTION_SPEAK.equals(accion)) {
                hablar(intent.getStringExtra(EXTRA_TEXT));
            } else if (ACTION_STOP.equals(accion)) {
                stopForeground(true);
                stopSelf();
            }
        }
        return START_STICKY;
    }

    private void hablar(String texto) {
        if (texto == null || texto.isEmpty() || !ttsListo) return;
        tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "nuvo_alerta");
    }

    private void crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(
                CHANNEL_ID, "NUVO · Lector Bluetooth",
                NotificationManager.IMPORTANCE_LOW
            );
            canal.setDescription("Mantiene activa la conexión con el lector de comprobantes");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(canal);
        }
    }

    private Notification construirNotificacion() {
        Intent abrirApp = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = null;
        if (abrirApp != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            contentIntent = PendingIntent.getActivity(this, 0, abrirApp, flags);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("NUVO escuchando el lector")
            .setContentText("Validando comprobantes en segundo plano")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }
}
