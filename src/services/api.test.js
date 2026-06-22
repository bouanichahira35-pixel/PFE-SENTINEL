// BLOC 1 - Role du fichier.
// Ce fichier organise les appels API ou la logique frontend partagee pour api.test.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

import { get, post } from "./api";

function jsonResponse(status, data) {
  const payload = data ?? {};
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return "application/json";
      },
    },
    json() {
      return Promise.resolve(payload);
    },
    text() {
      return Promise.resolve(JSON.stringify(payload));
    },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  jest.restoreAllMocks();
});

test("does not call refresh on 401 when no access token exists", async () => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith("/api/auth/login")) {
      return jsonResponse(401, { error: "Mot de passe incorrect" });
    }
    if (String(url).endsWith("/api/auth/refresh")) {
      throw new Error("refresh should not be called");
    }
    return jsonResponse(500, { error: "unexpected" });
  });

  await expect(
    post("/auth/login", { identifier: "x", password: "y" })
  ).rejects.toThrow("Mot de passe incorrect");

  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("extracts a readable message when API error is an object", async () => {
  global.fetch = jest.fn(async () => (
    jsonResponse(400, { error: { message: "Identifiant invalide" } })
  ));

  await expect(
    post("/auth/login", { identifier: "x", password: "y" })
  ).rejects.toThrow("Identifiant invalide");
});

test("does not expose object or backend details for malformed API responses", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 502,
    headers: {
      get() {
        return "text/html";
      },
    },
    text() {
      return Promise.resolve("<!DOCTYPE html><html><body>Proxy backend down</body></html>");
    },
  }));

  await expect(
    get("/products")
  ).rejects.toThrow("Operation impossible. Veuillez reessayer.");

  await expect(
    get("/products")
  ).rejects.not.toThrow("[object Object]");
});

test("refreshes token on 401 when access token exists and retries request", async () => {
  sessionStorage.setItem("token", "expired");

  let productsCalls = 0;
  global.fetch = jest.fn(async (url) => {
    const u = String(url);

    if (u.endsWith("/api/products")) {
      // First attempt returns 401, second attempt succeeds.
      productsCalls += 1;
      if (productsCalls === 1) return jsonResponse(401, { error: "Token invalide ou expire" });
      return jsonResponse(200, { items: [] });
    }

    if (u.endsWith("/api/auth/refresh")) {
      return jsonResponse(200, { token: "fresh" });
    }

    return jsonResponse(404, { error: "not_found" });
  });

  await expect(get("/products")).resolves.toEqual({ items: [] });
  expect(sessionStorage.getItem("token")).toBe("fresh");

  const urls = global.fetch.mock.calls.map(([calledUrl]) => String(calledUrl));
  expect(urls.filter((u) => u.endsWith("/api/products")).length).toBe(2);
  expect(urls.filter((u) => u.endsWith("/api/auth/refresh")).length).toBe(1);
});
