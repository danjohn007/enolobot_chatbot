import axios from "axios";
import { logger } from "./config.js";

const EMAIL_WEBHOOK_URL = "http://enolobot.digital/sistema/chatbot/envio_correo";
const EMAIL_WEBHOOK_API_KEY = process.env.EMAIL_WEBHOOK_API_KEY || "91b2c9e5-8f1a-4d3a-9c7e-2b5f6a7d8e9f";

export async function sendChatbotEmailPayload({ correoDestinatario, mensajeUsuario, idChat, asunto = "Payload del chatbot" }) {
  try {
    await axios.post(
      EMAIL_WEBHOOK_URL,
      {
        correo_destinatario: correoDestinatario,
        asunto,
        payload: {
          mensaje_usuario: mensajeUsuario,
          id_chat: String(idChat || ""),
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": EMAIL_WEBHOOK_API_KEY,
        },
        timeout: 15000,
      }
    );

    logger.info({ svc: "email", action: "payload_sent", to: correoDestinatario, idChat: String(idChat || "") });
    return true;
  } catch (err) {
    logger.error({
      svc: "email",
      action: "payload_send_failed",
      to: correoDestinatario,
      idChat: String(idChat || ""),
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });
    return false;
  }
}
