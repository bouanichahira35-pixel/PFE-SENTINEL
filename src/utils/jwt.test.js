// BLOC 1 - Role du fichier.
// Ce fichier regroupe des fonctions utilitaires frontend autour de jwt.test.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { decodeJwtPayload } from "./jwt";

function base64UrlEncodeJson(value) {
  const json = JSON.stringify(value);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

test("decodeJwtPayload decodes base64url payload without padding", () => {
  const header = base64UrlEncodeJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlEncodeJson({ username: "test", role: "admin", label: "é" });
  const token = `${header}.${payload}.sig`;

  expect(decodeJwtPayload(token)).toEqual({ username: "test", role: "admin", label: "é" });
});

test("decodeJwtPayload returns null on invalid tokens", () => {
  expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  expect(decodeJwtPayload("a.b")).toBeNull();
});

