import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, dictionaryKeys, formatDateValue, localeFromPath, localePath, localeUrl, translate, translateText } from "./localization.mjs";

test("resolves canonical locales from URL paths", () => {
  assert.equal(localeFromPath("/"), DEFAULT_LOCALE);
  assert.equal(localeFromPath("/ru/"), "ru");
  assert.equal(localeFromPath("/en/payments/"), "en");
  assert.equal(localeFromPath("/unsupported/"), DEFAULT_LOCALE);
  assert.equal(localePath("en"), "/en/");
  assert.equal(localeUrl("ru", "https://example.test"), "https://example.test/ru/");
});

test("Russian and English dictionaries have identical keys", () => {
  assert.deepEqual(dictionaryKeys("ru").sort(), dictionaryKeys("en").sort());
  assert.deepEqual(SUPPORTED_LOCALES, ["ru", "en"]);
});

test("translates representative interface text and dynamic counts", () => {
  assert.equal(translate("ru", "savePayment"), "Сохранить платеж");
  assert.equal(translate("en", "savePayment"), "Save payment");
  assert.equal(translateText("3 active records", "ru"), "Активные записи — 3 шт.");
  assert.equal(translateText("Payment register", "ru"), "Реестр платежей");
  assert.equal(formatDateValue("2026-10-03", "ru"), "03.10.2026");
});

test("README keeps Russian-first structural parity with English", () => {
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  const russian = readme.split("## Русская версия\n")[1].split("## English version\n")[0];
  const english = readme.split("## English version\n")[1];
  const structure = (section) => section.split("\n").map((line) => {
    if (line.startsWith("### ")) return "heading";
    if (line.startsWith("- ")) return "bullet";
    if (/^\d+\. /.test(line)) return "ordered";
    if (line.startsWith("```")) return "fence";
    return "";
  }).filter(Boolean);
  assert.deepEqual(structure(russian), structure(english));
});
