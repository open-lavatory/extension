import en from "./en.json";

type MessageKey = keyof typeof en;

const CATALOGUES = new Map(
  Object.entries(import.meta.glob<Partial<Record<MessageKey, string>>>("./*.json", { eager: true, import: "default" }))
    .map(([path, messages]) => [path.slice("./".length, -".json".length), messages]),
);

const detectLanguage = (): string => {
  for (const preferred of navigator.languages) {
    const tag = preferred.toLowerCase();
    const [base = ""] = tag.split("-", 1);

    if (CATALOGUES.has(tag)) return tag;

    if (CATALOGUES.has(base)) return base;
  }

  return "en";
};

export const language = detectLanguage();

const messages = CATALOGUES.get(language) ?? en;

export const t = (key: MessageKey, parameters?: Readonly<Record<string, string | number>>): string =>
  (messages[key] ?? en[key]).replaceAll(/\{(\w+)\}/gu, (placeholder, name: string) => String(parameters?.[name] ?? placeholder));
