# Backend local de prueba (sin GAS)

## Probar en tu propia laptop

1. Backend simulado (reemplaza el Sheet por un JSON local):
   ```
   node dev/mock-backend.js 8787
   ```
2. En otra terminal, servidor estático:
   ```
   python3 -m http.server 8080
   ```
3. Abre `http://localhost:8080/dev/scanner.local.html?v=009&monto=200.50`.

## Probar desde tu celular (cámara real)

`getUserMedia` (la cámara) solo funciona en `localhost` o en HTTPS — un
`http://192.168.x.x:8080` normal desde el celular no sirve. La forma más
simple es abrir un túnel HTTPS hacia tu laptop:

1. Usa el servidor combinado (estático + API en un solo puerto, para no
   tener que tunelizar dos puertos):
   ```
   node dev/local-server.js 8080
   ```
2. En otra terminal, abre un túnel HTTPS a ese puerto. Cualquiera de estos
   sirve, sin necesidad de cuenta:
   ```
   npx localtunnel --port 8080
   ```
   o, si tienes `cloudflared` instalado:
   ```
   cloudflared tunnel --url http://localhost:8080
   ```
3. Te va a dar una URL `https://algo.loca.lt` (o `trycloudflare.com`).
   Ábrela en el navegador de tu celular agregando la ruta:
   `https://algo.loca.lt/dev/scanner.local.html?v=009&monto=200.50`
4. Pulsa "Activar cámara" (ya deberías poder, por ser HTTPS) y apunta al QR
   de prueba (puedes mostrarlo en otra pantalla o imprimirlo).

`dev/scanner.local.html` usa `location.origin + '/api'` como backend, así
que funciona igual sin importar el dominio que te asigne el túnel.

## Notas

- `dev/scanner.local.html` es solo para desarrollo local. El `scanner.html`
  original (raíz del repo) queda intacto con el placeholder `GAS_URL` para
  el deploy real en GitHub Pages + Apps Script.
- `dev/registro.local.json` se crea automáticamente al probar (simula la
  hoja `REGISTRO_COMPROBANTES`); no se versiona.
- Una vez que despliegues `Code.gs` de verdad y publiques `scanner.html` en
  GitHub Pages, ya no necesitas ningún túnel: tu celular puede abrir la URL
  real de GitHub Pages directamente (también es HTTPS).
