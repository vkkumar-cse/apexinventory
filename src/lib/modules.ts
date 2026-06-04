export const MODULES = [
  { key: "inventory", label: "Inventory", enabled: true },
  { key: "attendance", label: "Attendance", enabled: false },
  { key: "customers", label: "Customers", enabled: true },
  { key: "crm", label: "CRM", enabled: false },
  { key: "delivery_challan", label: "DC Entry", enabled: true },
  { key: "user_management", label: "User Management", enabled: true },
  { key: "quotation", label: "Quotation", enabled: false },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_KEYS = MODULES.map((module) => module.key) as ModuleKey[];
export const WORKER_MODULES = MODULES.filter((module) => module.key !== "user_management");
export const ENABLED_MODULE_KEYS = MODULES.filter((module) => module.enabled).map((module) => module.key) as ModuleKey[];

export function isModuleEnabled(key: string) {
  return MODULES.some((module) => module.key === key && module.enabled);
}

export function normalizeModuleAccess(rawAccess: unknown): ModuleKey[] {
  let parsed = rawAccess;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  const allowed = new Set<string>(MODULE_KEYS);
  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key)
      : [];

  return Array.from(new Set(values.filter((key): key is ModuleKey => typeof key === "string" && allowed.has(key))));
}
