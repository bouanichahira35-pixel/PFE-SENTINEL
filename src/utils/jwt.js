// BLOC 1 - Role du fichier.
// Ce fichier regroupe des fonctions utilitaires frontend autour de jwt.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

export function decodeJwtPayload(token) {
  try {
    const payloadPart = String(token || "").split(".")[1];
    if (!payloadPart) return null;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    const binary = atob(padded);
    if (typeof TextDecoder !== "undefined") {
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const json = new TextDecoder("utf-8").decode(bytes);
      return JSON.parse(json);
    }

    // Fallback when TextDecoder isn't available (some test/older browser environments).
    const json = decodeURIComponent(
      Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
