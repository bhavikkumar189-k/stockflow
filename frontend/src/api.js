const configuredApiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
const API_URL =
  import.meta.env.PROD &&
  (!configuredApiUrl || configuredApiUrl.includes("localhost"))
    ? "https://stockflow-api-xhek.onrender.com"
    : configuredApiUrl || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.adminKey ? { "X-Admin-Key": options.adminKey } : {}),
      ...(options.customerToken
        ? { "X-Customer-Token": options.customerToken }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.map((item) => item.msg).join(", ") || "Request failed.",
    );
  }
  return response.status === 204 ? null : response.json();
}

const json = (method, data, adminKey, customerToken) => ({
  method,
  body: JSON.stringify(data),
  adminKey,
  customerToken,
});

export const api = {
  products: {
    list: () => request("/api/products"),
    create: (data, key) => request("/api/products", json("POST", data, key)),
    update: (id, data, key) =>
      request(`/api/products/${id}`, json("PATCH", data, key)),
    remove: (id, key) =>
      request(`/api/products/${id}`, { method: "DELETE", adminKey: key }),
  },
  customers: {
    access: (data) => request("/api/customers/access", json("POST", data)),
    list: (key) => request("/api/customers", { adminKey: key }),
    orders: (id, token) =>
      request(`/api/customers/${id}/orders`, { customerToken: token }),
  },
  orders: {
    create: (data, token) =>
      request("/api/orders", json("POST", data, undefined, token)),
    list: (key) => request("/api/orders", { adminKey: key }),
    status: (id, status, key) =>
      request(`/api/orders/${id}/status`, json("PATCH", { status }, key)),
  },
  admin: {
    verify: (key) =>
      request("/api/admin/verify", { method: "POST", adminKey: key }),
  },
};
