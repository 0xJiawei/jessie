import { useSettingsStore } from "../store/useSettingsStore";

type TemplateValues = Record<string, string | number>;

const applyTemplate = (text: string, values?: TemplateValues) => {
  if (!values) {
    return text;
  }

  return Object.entries(values).reduce(
    (current, [key, value]) => current.split(`{${key}}`).join(String(value)),
    text
  );
};

export const resolveLocale = (language?: string) => (language === "简体中文" ? "zh-CN" : "en");

export const tr = (
  language: string | undefined,
  english: string,
  simplifiedChinese: string,
  values?: TemplateValues
) => {
  const source = resolveLocale(language) === "zh-CN" ? simplifiedChinese : english;
  return applyTemplate(source, values);
};

export const useTr = () => {
  const language = useSettingsStore((state) => state.language);
  const locale = resolveLocale(language);

  return {
    language,
    locale,
    isZh: locale === "zh-CN",
    t: (english: string, simplifiedChinese: string, values?: TemplateValues) =>
      tr(language, english, simplifiedChinese, values),
  };
};
