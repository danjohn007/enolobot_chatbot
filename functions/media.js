// media.js - Image URL building and utilities
import { getPrimaryImageFor, getRoomImages } from "./db.js";
import axios from "axios";

export function buildPublicUrl(baseMediaUrl, imagePath) {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  
  let p = imagePath.replace(/^\/+/, '').replace(/^public\//, '');
  const b = baseMediaUrl.endsWith('/') ? baseMediaUrl : baseMediaUrl + '/';
  return b + p;
}

export async function getRoomMainImageUrl(pool, room, baseMediaUrl) {
  if (room.primary_image_path) {
    return buildPublicUrl(baseMediaUrl, room.primary_image_path);
  }
  
  // Fallback to first image from resource_images
  const imgs = await getRoomImages(pool, room.id);
  return imgs.length ? buildPublicUrl(baseMediaUrl, imgs[0]) : null;
}

export async function isReachable(url) {
  try {
    await axios.head(url, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}