import i18next from "i18next";

await i18next.init({
  lng: navigator.language,
  fallbackLng: "en",
  resources: {
    en: { translation: { words_one: "{{count}} word", words_other: "{{count}} words" } },
  },
});

document.body.textContent = i18next.t("words", { count: Number(location.hash.slice(1)) });
