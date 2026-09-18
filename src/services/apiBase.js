const configuredBaseUrl = String(
  import.meta.env.VITE_API_BASE_URL || ""
).trim();

export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

export function apiUrl(path) {
  const normalizedPath = String(path || "");

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return normalizedPath.startsWith("/")
    ? `${API_BASE_URL}${normalizedPath}`
    : `${API_BASE_URL}/${normalizedPath}`;
}
