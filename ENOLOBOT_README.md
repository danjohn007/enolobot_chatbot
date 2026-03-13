# Enolobot - Sistema de Chatbot para Viñedos 🍷

## 📋 Descripción

Enolobot es un chatbot de WhatsApp diseñado para viñedos que permite a los usuarios:
- Comprar botellas de vino
- Hacer reservaciones en restaurante o zona lounge
- Contactar con diferentes áreas administrativas
- Solicitar información sobre eventos privados
- Reservar cupo en catas de vino o vendimias

## 🚀 Cambios Implementados

### Archivos Nuevos Creados:

1. **`functions/wines.flow.js`** - Flujo de compra de vinos
2. **`functions/vineyard_reservation.flow.js`** - Flujo de reservaciones de viñedo
3. **`functions/contact.flow.js`** - Flujo de contacto con administración
4. **`functions/private_events.flow.js`** - Flujo de información de eventos privados
5. **`functions/wine_events.flow.js`** - Flujo de catas y vendimias
6. **`scripts/enolobot_tables.sql`** - Script SQL con la estructura de tablas necesarias

### Archivos Modificados:

1. **`functions/router.js`**
   - Nuevo mensaje de bienvenida de Enolobot
   - Menú principal con 5 opciones
   - Integración de todos los flujos nuevos
   - Handlers de botones y texto

2. **`functions/db.js`**
   - Funciones para manejo de vinos
   - Funciones para reservaciones de viñedo
   - Funciones para contacto
   - Funciones para eventos privados
   - Funciones para eventos de cata/vendimia

## 🛠️ Instalación

### 1. Crear las tablas en la base de datos

Ejecuta el script SQL en tu base de datos MySQL:

```bash
mysql -u tu_usuario -p tu_base_datos < scripts/enolobot_tables.sql
```

O desde MySQL Workbench/phpMyAdmin, ejecuta el contenido del archivo `scripts/enolobot_tables.sql`.

### 2. Configurar números de contacto

Edita el archivo `functions/contact.flow.js` (líneas 11-17) con los números telefónicos reales de tu viñedo:

```javascript
const CONTACT_NUMBERS = {
  facturacion: '441-XXX-XXXX',      // ← Actualizar
  gerencia: '441-XXX-XXXX',          // ← Actualizar
  servicio_cliente: '441-XXX-XXXX',  // ← Actualizar
  seguridad: '441-XXX-XXXX',         // ← Actualizar
  tienda: '441-XXX-XXXX'             // ← Actualizar
};
```

También actualiza en `functions/private_events.flow.js` (líneas 8-9):

```javascript
const PRIVATE_EVENTS_CONTACT = '441 138 8731';  // ← Actualizar
const PRIVATE_EVENTS_PERSON = 'nuestro equipo de eventos';  // ← Actualizar
```

### 3. Cargar datos de vinos y eventos

El script SQL incluye datos de ejemplo. Puedes:
- Modificarlos directamente en el SQL antes de ejecutarlo
- O agregar/editar desde la base de datos después de la instalación

```sql
-- Ejemplo: Agregar un nuevo vino
INSERT INTO wines (name, description, price, is_active, display_order) 
VALUES ('Cabernet Sauvignon 2023', 'Vino tinto premium', 450.00, 1, 5);

-- Ejemplo: Agregar un nuevo evento
INSERT INTO wine_events (name, description, event_date, price_per_person, is_active)
VALUES ('Cata Especial Navideña', 'Evento especial con vinos de temporada', '2026-12-15', 500.00, 1);
```

### 4. Desplegar cambios

```bash
cd functions
firebase deploy --only functions
```

O si usas otro método de deploy, asegúrate de que todos los archivos nuevos estén incluidos.

## 📱 Uso del Chatbot

### Inicio de Conversación

Cuando un usuario escribe "hola" (o cualquier mensaje que contenga "hola"), recibe:

```
Hola un placer leerte, me presento: soy Enolobot, un robot para ayudarte a 
encontrar el mejor vino para esa ocasión especial, realizar una reservación 
en tu viñedo favorito -ya sea- para realizar un recorrido o ir a comer en las 
opciones gastronómicas con las que contamos como catas-maridajes, eventos 
privados, comer, desayunar o cenar en los restaurantes que tenemos para ti 
¿hoy qué necesitas o cómo te puedo ayudar?
```

Seguido de un menú con 5 opciones.

## 🔄 Flujos Disponibles

### 1️⃣ Comprar una Botella

**Pasos:**
1. Solicita nombre y apellido
2. Muestra portafolio de vinos con imágenes y precios
3. Pregunta si desea detalles
4. Usuario selecciona vino
5. Solicita email para confirmación
6. Envía resumen de compra

**Archivos:** `wines.flow.js`, tabla `wines`, `wine_purchases`

### 2️⃣ Hacer una Reservación

**Pasos:**
1. Solicita nombre y apellido
2. Solicita número de personas
3. Solicita fecha (DD/MM/YYYY o "hoy"/"mañana")
4. Ofrece espacios: Restaurante o Zona Lounge
5. Solicita email
6. Envía confirmación con enlace de Google Maps

**Archivos:** `vineyard_reservation.flow.js`, tabla `vineyard_reservations`

### 3️⃣ Contactar con Administración

**Pasos:**
1. Solicita nombre y apellido
2. Muestra áreas disponibles:
   - Facturación
   - Gerencia
   - Servicio al Cliente
   - Seguridad y Estacionamiento
   - Tienda
3. Proporciona número telefónico del área seleccionada

**Archivos:** `contact.flow.js`, tabla `contact_requests`

### 4️⃣ Pedir Informes sobre Eventos Privados

**Pasos:**
1. Solicita nombre y apellido
2. Proporciona número de contacto del equipo de eventos

**Archivos:** `private_events.flow.js`, tabla `private_event_requests`

### 5️⃣ Asistir a Cata o Vendimia

**Pasos:**
1. Solicita nombre y apellido
2. Muestra próximos eventos programados
3. Usuario selecciona evento
4. Solicita número de personas
5. Calcula y muestra monto total
6. Ofrece métodos de pago: En línea o Transferencia
7. Solicita email
8. Envía confirmación con enlace de Google Maps

**Archivos:** `wine_events.flow.js`, tablas `wine_events`, `wine_event_reservations`

## 📊 Estructura de Base de Datos

### Tablas Principales:

| Tabla | Descripción |
|-------|-------------|
| `wines` | Catálogo de vinos disponibles para compra |
| `wine_purchases` | Registro de compras (drafts y confirmadas) |
| `vineyard_reservations` | Reservaciones de restaurante/lounge |
| `contact_requests` | Solicitudes de contacto con administración |
| `private_event_requests` | Solicitudes de info sobre eventos privados |
| `wine_events` | Catálogo de eventos (catas, vendimias) |
| `wine_event_reservations` | Reservaciones para eventos |

## 🔧 Configuración Adicional

### Imágenes de Vinos

Las imágenes se almacenan en el campo `image_path` de la tabla `wines`. La función `buildImageUrlFromConfig()` en `hotelconfig.js` convierte estas rutas en URLs completas.

Ejemplo:
```sql
UPDATE wines SET image_path = 'wines/tinto_reserva_2020.jpg' WHERE id = 1;
```

### Link de Google Maps

El enlace está hardcodeado en los flujos. Para cambiarlo:

**En `vineyard_reservation.flow.js`** (línea ~119):
```javascript
`https://maps.app.goo.gl/NYNzXRZksqTfhh83A\n\n` // ← Actualizar
```

**En `wine_events.flow.js`** (línea ~163):
```javascript
`https://maps.app.goo.gl/NYNzXRZksqTfhh83A\n\n` // ← Actualizar
```

## 🐛 Troubleshooting

### Error: "Tabla no existe"
- Verifica que ejecutaste el script `enolobot_tables.sql`
- Revisa que estás conectado a la base de datos correcta

### No se muestran vinos/eventos
- Verifica que `is_active = 1` en las tablas
- Para eventos, verifica que `event_date >= CURDATE()`

### Imágenes no se muestran
- Verifica la configuración en `hotelconfig.js`
- Asegúrate de que las rutas en `image_path` sean correctas
- Revisa los permisos del servidor de archivos

## 📝 Mantenimiento

### Agregar Nuevos Vinos

```sql
INSERT INTO wines (name, description, details, suggested_for, price, display_order, is_active)
VALUES (
    'Nombre del Vino',
    'Descripción breve',
    'Detalles completos y notas de cata',
    'Ocasiones sugeridas',
    299.00,
    10,
    1
);
```

### Agregar Nuevos Eventos

```sql
INSERT INTO wine_events (name, description, event_date, event_time, price_per_person, max_capacity, is_active)
VALUES (
    'Nombre del Evento',
    'Descripción del evento',
    '2026-06-15',
    '18:00:00',
    450.00,
    20,
    1
);
```

### Desactivar Vinos o Eventos

```sql
-- Desactivar vino
UPDATE wines SET is_active = 0 WHERE id = 5;

-- Desactivar evento
UPDATE wine_events SET is_active = 0 WHERE id = 3;
```

## 📞 Soporte

Para dudas o soporte técnico sobre la implementación, revisa:
- Los logs en Firebase/Cloud Functions
- Los mensajes en la consola del navegador
- La tabla `user_drafts` para ver el estado de las conversaciones

## 🎯 Próximos Pasos

1. Ejecutar el script SQL de creación de tablas
2. Actualizar números de contacto en los archivos mencionados
3. Cargar datos de vinos y eventos
4. Configurar URLs de imágenes
5. Desplegar a producción
6. Probar cada flujo con un número de WhatsApp de prueba

---

**¡Enolobot está listo para ayudar a tus clientes! 🍷🤖**
