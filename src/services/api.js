const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

function getAuthToken() {
  return sessionStorage.getItem("token") || localStorage.getItem("token") || "";
}

async function request(path, method, payload) {
  const headers = { "Content-Type": "application/json" };
  const token = getAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Erreur API");
  }

  return data;
}

export function post(path, payload) {
  return request(path, "POST", payload);
}

export function get(path) {
  return request(path, "GET");
}

export function put(path, payload) {
  return request(path, "PUT", payload);
}

export function patch(path, payload) {
  return request(path, "PATCH", payload);
}
