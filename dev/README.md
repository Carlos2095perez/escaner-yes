# Backend local de prueba (sin GAS)

Para probar `scanner.html` sin desplegar nada en Google Apps Script:

1. Levanta el backend simulado (reemplaza el Sheet por un archivo JSON local):
   ```
   node dev/mock-backend.js 8787
   ```
2. En otra terminal, sirve la carpeta del repo:
   ```
   python3 -m http.server 8080
   ```
3. Abre `http://localhost:8080/dev/scanner.local.html?v=009&monto=200.50`
   (esta copia ya apunta `GAS_URL` a `http://localhost:8787`; el `scanner.html`
   original queda intacto con el placeholder para producción).

`dev/scanner.local.html` es solo para desarrollo local — al desplegar el
proyecto real (GitHub Pages) se sigue usando `scanner.html` con la URL
`/exec` real del Web App de Apps Script.

`dev/registro.local.json` se crea automáticamente al probar (simula la hoja
`REGISTRO_COMPROBANTES`); no se versiona.
