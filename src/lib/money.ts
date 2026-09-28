export const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);
export const fromCents = (value: number) => value / 100;
export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const monthDate = (key: string) => { const [year, month] = key.split("-").map(Number); return new Date(year, month - 1, 1); };
export const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
export const formatMonth = (key: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthDate(key));
export const formatDate = (date: Date) => new Intl.DateTimeFormat("pt-BR").format(date);
export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(fromCents(cents));
export const monthRange = (center: string, count = 6) => { const base = monthDate(center); return Array.from({ length: count }, (_, index) => monthKey(addMonths(base, index - count + 1))); };
