# Imágenes

`logo.svg` es un **marcador**. El logotipo original venía incrustado en base64 dentro del
HTML antiguo y ya no está disponible, así que este archivo ocupa exactamente su misma caja
para que el encabezado no quede vacío.

## Poner el logo real

- **Si tienes el logo en SVG:** sobrescribe `assets/img/logo.svg`. No hay que tocar código.
- **Si sólo lo tienes en PNG o JPG:** guárdalo aquí (por ejemplo `logo.png`, cuadrado y de al
  menos 128 × 128 px, idealmente con fondo transparente) y cambia una sola línea en
  `assets/js/ui.js`:

  ```js
  var LOGO_SRC = 'assets/img/logo.png';
  ```

Si el archivo no existe, la interfaz cae automáticamente a un recuadro con las iniciales «PN».
