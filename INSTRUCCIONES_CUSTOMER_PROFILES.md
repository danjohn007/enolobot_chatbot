# Instrucciones: Almacenamiento de Nombres de Clientes

## 📋 Resumen de Cambios

Se ha implementado un sistema para **almacenar y recordar el nombre de los clientes** en el chatbot. Ahora, cuando un cliente proporciona su nombre por primera vez, el sistema lo guarda y **no volverá a preguntarlo** en futuras interacciones (misma sesión o sesiones posteriores).

## 🎯 Flujos Afectados

Los siguientes flujos ahora almacenan y reutilizan el nombre del cliente:

1. **Contacto** (`contact.flow.js`) - Al solicitar información de contacto
2. **Compra de Vinos** (`wines.flow.js`) - Al comprar vinos
3. **Reservación de Viñedo** (`vineyard_reservation.flow.js`) - Al reservar visitas al viñedo

## 🗄️ Cambios en Base de Datos

### Nueva Tabla: `customer_profiles`

Se creó una tabla para almacenar perfiles básicos de clientes identificados por su número de teléfono:

```sql
CREATE TABLE `customer_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(20) NOT NULL,
  `customer_name` VARCHAR(200) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_phone` (`phone`),
  KEY `idx_phone_lookup` (`phone`),
  KEY `idx_created_at` (`created_at`)
);
```

## 🚀 Instrucciones de Instalación

### Paso 1: Ejecutar Script SQL

1. Conectarse a la base de datos MySQL del sistema
2. Ejecutar el script ubicado en:
   ```
   scripts/add_customer_profiles_table.sql
   ```

**Opciones para ejecutar:**

#### Opción A: MySQL Command Line
```bash
mysql -u TU_USUARIO -p TU_BASE_DE_DATOS < scripts/add_customer_profiles_table.sql
```

#### Opción B: PHPMyAdmin
1. Abrir PHPMyAdmin
2. Seleccionar la base de datos
3. Ir a pestaña "SQL"
4. Copiar y pegar el contenido de `add_customer_profiles_table.sql`
5. Hacer clic en "Continuar"

#### Opción C: Workbench/HeidiSQL/DBeaver
1. Abrir tu herramienta de gestión de BD
2. Conectar a la base de datos
3. Abrir el archivo `add_customer_profiles_table.sql`
4. Ejecutar

### Paso 2: Desplegar las Funciones Actualizadas

Una vez ejecutado el script SQL, desplegar las funciones de Firebase:

```bash
firebase deploy --only functions
```

## 🔄 Cómo Funciona

### Flujo Primera Interacción:
```
Usuario → Selecciona opción (Contacto/Vinos/Viñedo)
       ↓
Sistema → Pregunta: "¿Con quién tengo el gusto (Nombre y apellido)?"
       ↓
Usuario → Responde con su nombre
       ↓
Sistema → GUARDA el nombre en customer_profiles
       ↓
Sistema → Continúa con el flujo normal
```

### Flujo Interacciones Posteriores:
```
Usuario → Selecciona opción (Contacto/Vinos/Viñedo)
       ↓
Sistema → Busca nombre guardado por teléfono
       ↓
Sistema → Encuentra nombre → "Mucho gusto [NOMBRE]"
       ↓
Sistema → Continúa con el flujo SIN PREGUNTAR el nombre
```

## 📊 Prioridad de Búsqueda

El sistema busca el nombre en el siguiente orden:

1. **Tabla `users`** (usuarios registrados) - Si existe, usa `first_name + last_name`
2. **Tabla `customer_profiles`** (contactos no registrados) - Si existe, usa `customer_name`
3. **Si no existe** - Pregunta el nombre y lo guarda en `customer_profiles`

## 🔍 Verificación

Para verificar que todo funciona correctamente:

1. **Verificar tabla creada:**
```sql
SHOW TABLES LIKE 'customer_profiles';
DESCRIBE customer_profiles;
```

2. **Ver perfiles guardados:**
```sql
SELECT * FROM customer_profiles ORDER BY created_at DESC LIMIT 10;
```

3. **Probar el chatbot:**
   - Interactuar con cualquiera de los 3 flujos
   - Proporcionar nombre cuando lo solicite
   - Escribir "hola" y volver a entrar al mismo flujo
   - **Resultado esperado:** No debe volver a preguntar el nombre

## 📝 Notas Adicionales

- Los nombres se normalizan (se limpian espacios extra, etc.)
- El teléfono se normaliza al formato E.164 mexicano (+52XXXXXXXXXX)
- Si un usuario ya está registrado en la tabla `users`, se usa su nombre de ahí
- La tabla usa `ON DUPLICATE KEY UPDATE` para actualizar si el usuario cambia su nombre
- Los nombres se mantienen indefinidamente (no expiran)

## 🛠️ Archivos Modificados

### Nuevos Archivos:
- `scripts/add_customer_profiles_table.sql` - Script de creación de tabla

### Archivos Modificados:
- `functions/db.js` - Agregadas funciones `getCustomerProfileByPhone()` y `saveCustomerProfile()`
- `functions/contact.flow.js` - Modificado para usar perfiles guardados
- `functions/wines.flow.js` - Modificado para usar perfiles guardados
- `functions/vineyard_reservation.flow.js` - Modificado para usar perfiles guardados

## ❓ Preguntas Frecuentes

**P: ¿Qué pasa si el cliente quiere cambiar su nombre?**  
R: Actualmente el nombre queda fijo. Se podría implementar un comando para actualizarlo.

**P: ¿Los usuarios registrados también usan esta tabla?**  
R: No, los usuarios registrados usan la tabla `users`. Solo los contactos no registrados usan `customer_profiles`.

**P: ¿Puedo borrar registros viejos?**  
R: Sí, puedes hacer limpieza manual con SQL:
```sql
DELETE FROM customer_profiles WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH);
```

**P: ¿Afecta esto a otros flujos?**  
R: No. Solo afecta a los 3 flujos mencionados (Contacto, Vinos, Viñedo).

---

✅ **Una vez completados ambos pasos, el sistema estará listo y funcionando.**
