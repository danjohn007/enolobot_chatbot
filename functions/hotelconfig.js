// Node ESM

/**
 * Catálogo de hoteles/chatbots soportados.
 * Agrega un bloque por cada hotel que planees manejar.
 */
const HOTELS = {
  // --- Ejemplo actual: MajorBot ---
  majorbot: {
    key: 'majorbot',
    hotelId: 6, // <-- ID del hotel activo
    name: 'Rancho Paraíso Real',
    // Debe terminar con '/'
    baseMediaUrl: 'https://ranchoparaisoreal.com/majorbot/public/',
    // Estados "considerados disponibles" en BD
    availableStatuses: ['available', 'avaliable'], // contempla typo en datos
    // Lógica para decidir el hotelId para reservas (puedes hacerla más compleja si quieres)
    resolveHotelIdForReservations(user) {
      // hoy forzamos el hotel configurado
      return this.hotelId;
    },
    // Construcción de URLs de imagen en base a image_path (uploads/...).
    buildImageUrl(imagePath) {
      if (!imagePath) return null;
      if (/^https?:\/\//i.test(imagePath)) return imagePath;
      let p = imagePath.replace(/^\/+/, '').replace(/^public\//, '');
      const b = this.baseMediaUrl.endsWith('/') ? this.baseMediaUrl : this.baseMediaUrl + '/';
      return b + p;
    },
    // Mensajes/etiquetas personalizables por hotel (opcional)
    labels: {
      mainMenuGuest: 'Hola {name}, ¿Qué es lo que deseas hacer?',
      mainMenuNonGuest: 'Hola {name}, ¿Qué deseas ver?',
      noRooms: 'Por ahora no hay habitaciones disponibles para este hotel.',
    }
  },

  // --- Ejemplo de otro hotel futuro ---
  // hotelX: { ... }
};

/**
 * Selector de hotel por clave. Usará:
 * 1) process.env.HOTEL_KEY (inyectado desde secret/vars)
 * 2) 'majorbot' como default
 */
function selectHotelConfig() {
  const key = process.env.HOTEL_KEY || 'majorbot';
  const cfg = HOTELS[key];
  if (!cfg) throw new Error(`HOTEL_KEY "${key}" no está configurado en hotelconfig.js`);
  return cfg;
}

// Export público
export const hotel = selectHotelConfig();
export default hotel;

// Helpers re-exportados para uso directo
export function getHotelIdForReservations(user) {
  return hotel.resolveHotelIdForReservations(user);
}

export function buildImageUrlFromConfig(imagePath) {
  return hotel.buildImageUrl(imagePath);
}

export function isStatusAvailable(status) {
  return hotel.availableStatuses.includes(String(status).toLowerCase());
}