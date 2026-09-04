# DESIGN.md — Sistema de diseño de NUVO

Este archivo es la referencia obligatoria para cualquier cambio de UI en este
repo (`scanner.html`, `android-app/www/index.html`). No se "mejora la UI" sin
mirar esto primero — las reglas de abajo son las que separan una pantalla que
funciona de una que se siente premium.

## Stack de estilos

Tailwind se compila **estático, offline, sin bundler** con el CLI standalone
(`@tailwindcss/cli`). Nada de `cdn.tailwindcss.com`: ese CDN compila en
runtime y necesita red — dentro del WebView de Capacitor sin conexión la app
se queda sin estilos, y además parpadea en cada carga mientras compila.

```bash
npm install                 # una vez
npm run build:css           # compila src/input.css -> styles.css y lo copia a android-app/www/styles.css
npm run watch:css           # mientras editás (solo compila a la raiz, no copia a www — correr build:css antes de commitear)
```

`styles.css` se commitea en los dos lugares (raiz, para GitHub Pages; y
`android-app/www/`, para Capacitor) porque ninguno de los dos entornos corre
un build — sirven los archivos tal cual están en el repo. **Después de tocar
`src/input.css` o agregar clases de Tailwind nuevas al HTML, correr
`npm run build:css` antes de hacer commit.**

Tokens de marca (colores, radios, tipografía, curvas de animación) están en
`src/input.css` dentro de `@theme` y espejan las custom properties CSS que ya
existían en `:root` de `scanner.html` — son la misma paleta, no una nueva.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#0A163D` | Fondo base de toda la app |
| `--color-azul-70` | `#3A4468` | Bordes, superficies secundarias |
| `--color-violeta` | `#6C3AED` | Acento de marca, membresías |
| `--color-yellow` | `#FFC700` | Acción primaria (CTA), estado "escaneando" |
| `--color-green` / `-lo` / `-hi` | `#00D26A` / `#05231A` / `#5CF0A6` | Éxito / comprobante válido |
| `--color-red` / `-lo` | `#FF4152` / `#2A0E12` | Error / comprobante inválido o duplicado |
| `--color-muted` | `#9AA1AA` | Texto secundario |
| `--font-sora` | Poppins | Titulares, montos, énfasis |
| `--font-inter` | Inter | Texto de cuerpo |
| `--radius-card` | 18px | Tarjetas |
| `--radius-sheet` | 24px | Bottom sheets / paneles |
| `--radius-pill` | 999px | Chips, badges, botones pill |
| `--duration-tap` | 120ms | Feedback táctil (press) |
| `--duration-sheet` | 280ms | Entrada/salida de paneles y transiciones de pantalla |
| `--ease-tap` | `cubic-bezier(.2,.8,.2,1)` | Curva estándar para toda animación de UI |

## Reglas obligatorias

1. **Todo elemento pulsable tiene 3 estados: pressed, loading, disabled.**
   Pressed = clase utilitaria `.pressable` (`transform: scale(.97)` al
   `:active`, ya definida en `src/input.css`). Nunca dejar un botón sin
   feedback al tocar.
2. **Toda animación anima solo `transform` y `opacity`.** Nunca `top`,
   `left`, `width`, `height` ni `margin` — eso fuerza layout/paint en cada
   frame y se ve entrecortado (ya fue el bug de la línea del escáner, no
   repetirlo).
3. **Toda lista o dato que tarda en llegar (red, Supabase) muestra un
   skeleton con la marca**, nunca un spinner gris genérico ni una pantalla en
   blanco. Clase `.skeleton` ya definida (shimmer con los colores de marca).
4. **Confirmaciones importantes (comprobante aceptado/rechazado, guardado)
   llevan `navigator.vibrate(10)`** además del cambio visual — nunca solo
   color.
5. **Transiciones entre pantallas/paneles usan la View Transitions API**
   nativa (`document.startViewTransition(...)`), no cortes secos. Soportada
   en el WebView de Android moderno, que es el único target real de esta
   app — no hace falta librería. Duración: `--duration-sheet` (280ms),
   curva `--ease-tap`.
6. **Gestos en vez de botones cuando el gesto es más rápido**: swipe para
   confirmar, bottom sheet arrastrable con pointer events (no una librería —
   ~100 líneas es suficiente para este alcance). Ver `--radius-sheet` para el
   redondeo del panel.
7. **Nunca introducir una dependencia CDN nueva sin verificar que funciona
   offline** si el código corre dentro del WebView empaquetado
   (`android-app/www/`). Nota aparte, ya existente y pendiente de revisar:
   `jsqr`, `@supabase/supabase-js`, `jspdf` y `xlsx` hoy se cargan desde
   `cdn.jsdelivr.net` en ambos HTML — si alguna vez se necesita escaneo 100%
   offline, esas también hay que vendorizarlas localmente.

## Cuándo migrar a un framework (React, etc.)

No está atado a ningún hito del roadmap (Bluetooth, etc.). El disparador es
la complejidad de estado: el día que estemos sincronizando el DOM a mano en
más de 5-6 lugares y empiecen bugs de estado desincronizado, ahí se paga
sola una librería con estado declarativo. Mientras la app sea
escáner + panel admin, vanilla + las reglas de este documento alcanza — y
migrar sin haber escrito primero estas reglas solo agrega dependencias sin
arreglar la sensación de "básico".
