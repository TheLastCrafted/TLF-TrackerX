import { useI18n } from "@/src/i18n/use-i18n";
import { LegalBullet, LegalCard, LegalParagraph, LegalShell } from "./_legal-shell";

export default function DataSourcesScreen() {
  const { t } = useI18n();

  return (
    <LegalShell
      title={t("Data & Sources", "Daten & Quellen")}
      subtitle={t("Feed transparency and reliability notes.", "Transparenz zu Feeds und Zuverlaessigkeit.")}
    >
      <LegalCard title={t("Market data", "Marktdaten")}>
        <LegalBullet>{t("Crypto quotes and charts: CoinGecko API (with internal caching/fallback handling).", "Krypto-Kurse und Charts: CoinGecko API (mit internem Caching/Fallbacks).")}</LegalBullet>
        <LegalBullet>{t("Equity and ETF quotes: Yahoo Finance endpoints and fallback quote methods.", "Aktien- und ETF-Kurse: Yahoo-Finance-Endpunkte und Fallback-Methoden.")}</LegalBullet>
        <LegalBullet>{t("Some derived metrics may be estimated when primary fields are missing.", "Einige abgeleitete Kennzahlen koennen geschaetzt werden, wenn Primärfelder fehlen.")}</LegalBullet>
      </LegalCard>

      <LegalCard title={t("Macro data", "Makrodaten")}>
        <LegalBullet>{t("US macro series: FRED graph CSV series endpoints.", "US-Makroserien: FRED-Graph-CSV-Serienendpunkte.")}</LegalBullet>
        <LegalBullet>{t("EU/global widgets may combine static presets and live snapshots from available feeds.", "EU-/Global-Widgets koennen statische Presets mit Live-Snapshots aus verfuegbaren Feeds kombinieren.")}</LegalBullet>
      </LegalCard>

      <LegalCard title={t("News data", "News-Daten")}>
        <LegalBullet>{t("Primary feeds: mixed category sources (Google News RSS, selected finance/news RSS feeds, and public Reddit category streams).", "Primaere Feeds: gemischte Kategoriequellen (Google-News-RSS, ausgewaehlte Finanz-/News-RSS-Feeds und oeffentliche Reddit-Kategorie-Streams).")}</LegalBullet>
        <LegalBullet>{t("Article body previews are fetched from source links when available and allowed.", "Artikelvorschauen werden bei verfuegbarer/erlaubter Quelle aus dem Link geladen.")}</LegalBullet>
        <LegalBullet>{t("Image quality and availability depend on source-side hosting and restrictions.", "Bildqualitaet und Verfuegbarkeit haengen vom Quell-Hosting und dessen Restriktionen ab.")}</LegalBullet>
      </LegalCard>

      <LegalCard title={t("Delays and limits", "Verzoegerungen und Limits")}>
        <LegalParagraph>
          {t(
            "Third-party APIs may apply rate limits, temporary blocks, stale caches, or symbol gaps. If this happens, TrackerX falls back where possible and may temporarily show delayed or unavailable quotes.",
            "Drittanbieter-APIs koennen Rate Limits, temporaere Sperren, veraltete Caches oder Symbol-Luecken haben. In solchen Faellen nutzt TrackerX Fallbacks, sofern moeglich, und kann zeitweise verzoegerte oder nicht verfuegbare Kurse anzeigen."
          )}
        </LegalParagraph>
      </LegalCard>

      <LegalCard title={t("Interpretation guidance", "Hinweise zur Interpretation")}>
        <LegalBullet>{t("Treat all live values as indicative, not execution-guaranteed.", "Behandle Live-Werte als indikativ, nicht als ausfuehrungsgarantiert.")}</LegalBullet>
        <LegalBullet>{t("Confirm critical decisions with your broker/exchange before executing.", "Wichtige Entscheidungen vor Ausfuehrung beim Broker/Exchange gegenpruefen.")}</LegalBullet>
      </LegalCard>
    </LegalShell>
  );
}
