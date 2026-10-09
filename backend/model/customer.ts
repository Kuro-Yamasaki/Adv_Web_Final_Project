export interface CustomerInput {
  first_name: string;
  last_name: string;
  phone: string;
  latitude: number;
  longitude: number;
}
export interface Customer extends CustomerInput { id: number; }

// TypeScript interfaces do not validate incoming JSON at runtime.
export function validateCustomer(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Body must be a JSON object";
  const data = body as Record<string, unknown>;
  for (const [key, max] of [["first_name", 100], ["last_name", 100], ["phone", 20]] as const) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      return `${key} must be a non-empty string with at most ${max} characters`;
    }
  }
  for (const [key, min, max] of [["latitude", -90, 90], ["longitude", -180, 180]] as const) {
    const value = data[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return `${key} must be a number between ${min} and ${max}`;
    }
  }
  return null;
}
