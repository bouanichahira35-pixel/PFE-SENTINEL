const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

function getAuthToken() {
  return sessionStorage.getItem("token") || localStorage.getItem("token") || "";
}

function getRefreshToken() {
  return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken") || "";
}

async function request(path, method, payload, retried = false) {
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

  if (res.status === 401 && !retried && path !== "/auth/refresh") {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const refreshData = await refreshRes.json().catch(() => ({}));
      if (refreshRes.ok && refreshData.token) {
        sessionStorage.setItem("token", refreshData.token);
        return request(path, method, payload, true);
      }
    }
  }

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

export async function uploadFile(path, file, fieldName = "file") {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur upload");
  return data;
}
