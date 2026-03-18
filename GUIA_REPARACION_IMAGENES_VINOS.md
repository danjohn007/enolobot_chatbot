# Diagnóstico y Solución: Imágenes de Vinos Sin Mostrar

## Problema Identificado

Cuando un vino tiene un `image_path` especificado en la base de datos:
1. El chatbot intenta enviar la imagen a través de WhatsApp
2. Si la imagen falla, intenta enviar el texto como fallback
3. **BUG**: Si alguno de estos pasos falla sin error handling adecuado, el usuario no recibe ni la imagen ni el texto

## Causas Posibles

### 1. **Ruta de Imagen Mal Formada** (Más probable)
El `image_path` en la base de datos tiene un formato incorrecto:
- ❌ `/uploads/amenities/wines/wine1.png` (slash inicial)
- ❌ `public/uploads/amenities/wines/wine1.png` (incluye public/)
- ❌ `uploads/amenities/wines/wine1.png` (incluye uploads/)
- ✅ `amenities/wines/wine1.png` (formato correcto)

### 2. **URL No Accesible Desde Meta/WhatsApp**
Aunque la ruta sea correcta, si la URL no es pública o accesible desde Internet, WhatsApp no puede descargarla.

Expected URL: `http://enolobot.digital/sistema/public/uploads/amenities/wines/wine1.png`

### 3. **Error Handling Incompleto en el Código** 
Si el fallback de texto también fallaba, no había try/catch anidado para capturarlo.

## Cambios Implementados

### ✅ Reparación 1: Mejor Error Handling en wines.flow.js
- Añadido try/catch anidado en el fallback de texto
- Si falla la imagen → intenta enviar texto
- Si falla el texto → logúea el error pero continúa el flujo
- Esto asegura que el usuario reciba ALGO (imagen, texto, o al menos un log del error)

### ✅ Reparación 2: Reparación Consistente en Otros Flows
Se aplicó la misma mejora a:
- `amenities.flow.js`
- `guest_amenities.flow.js`
- `rooms.flow.js` (3 ubicaciones)

## Pasos para Resolver

### Paso 1: Verificar image_path en Base de Datos
Ejecuta el script de debug:
```bash
mysql -h [host] -u [user] -p [database] < scripts/debug_wine_image_paths.sql
```

O copia y pega el contenido de `scripts/debug_wine_image_paths.sql` en tu cliente MySQL.

**Busca especialmente**:
- Registro 2: Ver qué valor tiene en `image_path`
- Ver si hay formatos inconsistentes

### Paso 2: Corregir Rutas Si Es Necesario

Si todos los `image_path` tienen el formato incorrecto, ajusta uno de estos comandos:

```sql
-- Si tienes prefijo /uploads/
UPDATE wines SET image_path = REPLACE(image_path, '/uploads/', '') 
WHERE image_path LIKE '/uploads/%';

-- Si tienes prefijo public/uploads/
UPDATE wines SET image_path = REPLACE(image_path, 'public/uploads/', '')
WHERE image_path LIKE 'public/uploads/%';

-- Si tienes prefijo uploads/ (sin /)
UPDATE wines SET image_path = REPLACE(image_path, 'uploads/', '')
WHERE image_path LIKE 'uploads/%';
```

### Paso 3: Verificar que URLs Existen

Para el vino con `image_path = 'amenities/wines/wine1.png'`:
1. Construida URL esperada: `http://enolobot.digital/sistema/public/uploads/amenities/wines/wine1.png`
2. Abre en navegador para verificar que la imagen existe y es accesible

### Paso 4: Probar el Chatbot

Después de corregir las rutas:
1. Reinicia el servidor
2. Inicia un nuevo diálogo de vinos en el chatbot
3. Verifica que ahora se muestren las imágenes correctamente

## Qué Verificar en Logs

Después de las reparaciones, en los logs deberías ver:

```
✅ CORRECTO:
{ svc: 'wines', action: 'sending_image', wine_name: 'Gran Ensemble 2021', url: 'http://enolobot.digital/sistema/public/uploads/amenities/wines/wine1.png' }
{ svc: 'wines', action: 'image_sent_success', wine_name: 'Gran Ensemble 2021' }

❌ Si hay error (pero con fallback):
{ svc: 'wines', action: 'image_send_failed', ... }
{ svc: 'wines', action: 'fallback_text_sent_after_image_fail', wine_name: 'Gran Ensemble 2021' }
```

## Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| `wines.flow.js` | Try/catch anidado en fallback de texto (2 ubicaciones) |
| `amenities.flow.js` | Try/catch anidado en fallback de texto |
| `guest_amenities.flow.js` | Try/catch anidado en fallback de texto |
| `rooms.flow.js` | Try/catch anidado en fallback de texto (3 ubicaciones) |

## Nota Importante

Estos cambios aseguran que:
1. El chatbot SIEMPRE responda al usuario (imagen, texto, o fallback)
2. Los errores se loguean adecuadamente para debugging
3. El flujo continúa sin romparse aunque falle algo

Sin embargo, la solución PRINCIPAL es asegurar que los `image_path` sean correctos en la base de datos.
