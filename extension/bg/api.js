// bg/api.js
import { BACKEND_BASE } from "./constants.js";

export async function backend(path, payload) {
  const res = await fetch(BACKEND_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(data)}`);
  }
  return data;
}
