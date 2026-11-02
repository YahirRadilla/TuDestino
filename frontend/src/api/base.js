// Base URL of the API. Kept in its own module so the service worker can share it with the page.
export const API_BASE = import.meta.env?.VITE_API_URL ?? '/api/v1';
