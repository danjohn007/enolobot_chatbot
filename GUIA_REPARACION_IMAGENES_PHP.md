# GUÍA: Restaurar acceso a imágenes en enolobot.digital

## PROBLEMA IDENTIFICADO
Las URLs de imagen retornan HTML 404 en vez de la imagen real:
- URL: `http://enolobot.digital/sistema/public/uploads/wines/wine1.png`
- Respuesta actual: `Content-Type: text/html` con body `404 - Page Not Found`
- Respuesta esperada: `Content-Type: image/png` con datos binarios de la imagen

## CAUSA RAÍZ
El router PHP (probablemente Laravel/Symfony) está capturando TODAS las rutas, incluyendo `/uploads/`, y enviándolas al front-controller en vez de servir los archivos estáticos directamente.

## SOLUCIÓN (3 pasos)

### Paso 1: Ubicar el .htaccess correcto
Conéctate por FTP/SSH a tu servidor y navega a:
```
/ruta/completa/enolobot.digital/sistema/public/
```

Busca el archivo `.htaccess` existente. Si no existe, créalo.

### Paso 2: Reemplazar o modificar el .htaccess
Copia el contenido del archivo `.htaccess_template_for_php_server` (generado arriba) y reemplaza completamente tu `.htaccess` actual.

**O si prefieres solo agregar las reglas, inserta ANTES de cualquier `RewriteRule` existente:**
```apache
# Servir archivos físicos directamente (incluye /uploads/)
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Excepción explícita para uploads
RewriteRule ^uploads/ - [L]
```

### Paso 3: Verificar que funciona
Desde PowerShell (o navegador):
```powershell
Invoke-WebRequest -Uri "http://enolobot.digital/sistema/public/uploads/wines/wine1.png" -Method Head | Select-Object StatusCode,@{N='ContentType';E={$_.Headers['Content-Type']}}
```

Debe devolver:
- `StatusCode: 200`
- `ContentType: image/png` (o `image/jpeg` según el tipo)

**NO DEBE devolver:**
- `ContentType: text/html`

### Paso 4: Probar el bot de WhatsApp
Una vez confirmado que la imagen responde bien:
1. Abre WhatsApp y escribe "hola" al bot
2. Selecciona "Comprar una Botella"
3. Ingresa tu nombre
4. **Deberías ver el portafolio con imágenes**

## ALTERNATIVA SI NO TIENES ACCESO A .htaccess

Si usas **Nginx** en vez de Apache, necesitas editar tu archivo de configuración del sitio:

```nginx
server {
    # ... tu configuración actual ...

    # Servir archivos estáticos directamente
    location ~* \.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$ {
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Ubicación específica para uploads
    location /uploads/ {
        try_files $uri =404;
        expires 30d;
    }

    # Front-controller PHP para el resto
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # ... resto de configuración ...
}
```

Luego reinicia Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## VERIFICACIÓN FINAL EN BASE DE DATOS

Si las imágenes siguen sin mostrarse después del ajuste, verifica que las rutas en la base de datos sean correctas:

```sql
SELECT id, name, image_path FROM wines LIMIT 5;
```

Debería mostrar rutas como:
- `wines/wine1.png` (correcto - relativo)
- NO `public/uploads/wines/wine1.png` (incorrecto - no incluir public/)
- NO `/sistema/public/uploads/wines/wine1.png` (incorrecto - no incluir path absoluto)

Si están mal, corregir con:
```sql
UPDATE wines SET image_path = REPLACE(image_path, 'public/uploads/', '');
UPDATE wines SET image_path = REPLACE(image_path, '/sistema/public/uploads/', '');
```

## CONTACTO
Si después de estos pasos siguen sin verse las imágenes, compárteme:
1. El contenido de tu `.htaccess` actual
2. La salida del comando de verificación (Paso 3)
3. El tipo de servidor web que usas (Apache/Nginx)
