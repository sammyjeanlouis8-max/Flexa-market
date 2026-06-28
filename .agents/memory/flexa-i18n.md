---
name: Flexa Market i18n convention
description: Where translations live, which locales are actually maintained, and the recurring hardcoded-Creole pitfall.
---

## Where
- Translations are nested TS objects at `artifacts/marketplace/src/i18n/locales/<lang>.ts` (af, ar, de, en, es, fil, fr, ha, hi, ht, it, ja, ko, nl, no, pt, sv, sw, zu). Used via `const { t } = useTranslation(); t("section.key")`.

## What's actually maintained
- Only **en, fr, ht** are kept current. The other ~16 locales are stale/partial and rely on i18next fallback. **When adding new UI strings, add keys to en/fr/ht** (ht = Haitian Creole, the user's primary language). Don't bother hand-translating all 19.

## Recurring pitfall
- Many components ship **hardcoded Creole strings** instead of `t()` calls (e.g. card labels, buttons). When asked to "add translations / mete tradiction", the real work is routing those literals through `t()` and adding the keys to en/fr/ht — the bug is not a missing locale file, it's literals bypassing i18n.
- **Why:** the app is multi-language but built Creole-first, so devs inline Creole and forget the t() layer.
