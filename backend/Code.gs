/**
 * SMART MEMORY - Manual de Interventoría INVIAS
 * Backend gratuito en Google Apps Script.
 * Recibe la pregunta del usuario + el contexto del manual, y la reenvía
 * a la API gratuita de Gemini (Google AI Studio) para generar una
 * respuesta en lenguaje natural con grounding real.
 *
 * COSTO: $0. Apps Script es gratis (20.000 llamadas/día incluso en
 * cuenta personal). El único límite real es el de Gemini (ver abajo).
 *
 * Usa GET en vez de POST porque Apps Script no siempre devuelve el
 * header Access-Control-Allow-Origin en respuestas POST a sitios
 * externos (problema conocido y documentado de Apps Script), mientras
 * que en GET sí lo hace de forma consistente.
 *
 * INSTRUCCIONES DE DESPLIEGUE (hazlo tú, 5 minutos):
 * 1. Ve a https://script.google.com -> Proyecto nuevo.
 * 2. Borra el contenido de Code.gs y pega TODO este archivo.
 * 3. Ve a https://aistudio.google.com/app/apikey, crea una API key
 *    gratuita (NO asocies tarjeta de crédito / facturación).
 * 4. Pega esa key abajo en GEMINI_API_KEY.
 * 5. Guarda (Ctrl+S).
 * 6. "Desplegar" -> "Nueva implementación" -> tipo "Aplicación web" ->
 *    Ejecutar como "Yo" -> Quién tiene acceso "Cualquier usuario" ->
 *    "Implementar" -> autoriza permisos -> copia la URL que termina en /exec.
 * 7. Pega esa URL en app.js, en la constante GEMINI_BACKEND_URL.
 *
 * Si ya tenías una implementación y solo cambiaste el código: "Desplegar"
 * -> "Gestionar implementaciones" -> lápiz (editar) -> "Versión" ->
 * "Nueva versión" -> "Implementar". La URL /exec se mantiene igual.
 */

const GEMINI_API_KEY = "PEGA_AQUI_TU_API_KEY_DE_AI_STUDIO"; // <-- reemplazar
const GEMINI_MODEL = "gemini-2.0-flash"; // modelo gratuito, rápido

function callGemini(question, context) {
  try {
    const prompt =
      "Eres un asistente experto en el Manual de Interventoría (MEPI) del " +
      "Instituto Nacional de Vías (INVIAS) de Colombia. Si la pregunta se " +
      "relaciona con el contexto dado, respóndela con base en él y cita el " +
      "código del instructivo (ej: MEPI-MN1-IN-1) cuando sea posible. Si la " +
      "pregunta es más general (ej. qué es una interventoría, conceptos " +
      "generales de contratación estatal en Colombia), respóndela con tu " +
      "conocimiento general pero acláralo brevemente. Responde en español, " +
      "de forma clara y concisa (máximo 150 palabras).\n\n" +
      "CONTEXTO (instructivos disponibles en la base local):\n" + context + "\n\n" +
      "PREGUNTA: " + question;

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());

    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    } else if (json.error) {
      // Devuelve el motivo real (ej: límite de cuota excedido o API key
      // inválida) para poder depurar.
      return "⚠️ Gemini no respondió: " + (json.error.message || JSON.stringify(json.error));
    }
    return "No se pudo generar una respuesta en este momento.";

  } catch (err) {
    return "Error interno: " + err.message;
  }
}

// Ruta principal: la app llama aquí vía GET con ?q=pregunta&ctx=contexto
// (GET evita el problema de CORS que tiene Apps Script con POST).
function doGet(e) {
  const params = (e && e.parameter) || {};

  // Sin parámetros: es solo la prueba de salud en el navegador.
  if (!params.q) {
    return ContentService.createTextOutput(JSON.stringify({ status: "Smart Memory backend activo ✅" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const question = params.q || "";
  const context = params.ctx || "";
  const answer = callGemini(question, context);

  return ContentService.createTextOutput(JSON.stringify({ answer: answer }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Se mantiene por compatibilidad, aunque la app ya usa GET.
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const answer = callGemini(body.question || "", body.context || "");
    return ContentService.createTextOutput(JSON.stringify({ answer: answer }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ answer: "Error interno: " + err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
