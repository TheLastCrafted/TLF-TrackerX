import { useI18n } from "@/src/i18n/use-i18n";
import { LegalBullet, LegalCard, LegalParagraph, LegalShell } from "./_legal-shell";

export default function TermsScreen() {
  const { t } = useI18n();

  return (
    <LegalShell
      title={t("Terms & Conditions", "Nutzungsbedingungen")}
      subtitle={t("How TrackerX can be used.", "Wie TrackerX genutzt werden darf.")}
    >
      <LegalCard title={t("Service scope", "Leistungsumfang")}>
        <LegalParagraph>
          {t(
            "TrackerX provides market data views, analytics tools, and personal tracking workflows for educational and informational use.",
            "TrackerX bietet Marktdatenansichten, Analysefunktionen und persoenliche Tracking-Workflows zur Information und Bildung."
          )}
        </LegalParagraph>
      </LegalCard>

      <LegalCard title={t("No investment advice", "Keine Anlageberatung")}>
        <LegalBullet>
          {t(
            "Content, scores, alerts, and summaries are not financial advice or a recommendation to buy or sell any asset.",
            "Inhalte, Scores, Alarme und Zusammenfassungen sind keine Finanzberatung und keine Kauf-/Verkaufsempfehlung."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "You remain fully responsible for trade, allocation, and risk decisions.",
            "Du bleibst voll verantwortlich fuer alle Handels-, Allokations- und Risikoentscheidungen."
          )}
        </LegalBullet>
      </LegalCard>

      <LegalCard title={t("Data and availability", "Daten und Verfuegbarkeit")}>
        <LegalBullet>
          {t(
            "Quotes and macro series may be delayed, incomplete, or temporarily unavailable due to third-party provider limits.",
            "Kurse und Makroserien koennen aufgrund von Drittanbieter-Limits verzoegert, unvollstaendig oder zeitweise nicht verfuegbar sein."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "App features can change over time and some modules may be disabled during maintenance.",
            "App-Funktionen koennen sich aendern; einzelne Module koennen waehrend Wartung voruebergehend deaktiviert sein."
          )}
        </LegalBullet>
      </LegalCard>

      <LegalCard title={t("Acceptable use", "Zulaessige Nutzung")}>
        <LegalBullet>
          {t(
            "Do not attempt to abuse APIs, scrape protected content, reverse engineer services, or disrupt app operation.",
            "Keine missbraeuchliche API-Nutzung, kein Abruf geschuetzter Inhalte, kein Reverse Engineering und keine Stoerung des App-Betriebs."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "You may not use TrackerX for unlawful activity.",
            "TrackerX darf nicht fuer rechtswidrige Zwecke verwendet werden."
          )}
        </LegalBullet>
      </LegalCard>

      <LegalCard title={t("Liability", "Haftung")}>
        <LegalParagraph>
          {t(
            "TrackerX is provided “as is” without warranties of uninterrupted service, absolute accuracy, or fitness for a specific purpose.",
            "TrackerX wird „wie gesehen“ bereitgestellt, ohne Gewaehr fuer unterbrechungsfreien Betrieb, absolute Genauigkeit oder Eignung fuer einen bestimmten Zweck."
          )}
        </LegalParagraph>
      </LegalCard>

      <LegalCard title={t("Updates and contact", "Updates und Kontakt")}>
        <LegalParagraph>
          {t(
            "These terms may be updated as features evolve. Continued use means acceptance of the latest version shown in-app.",
            "Diese Bedingungen koennen mit neuen Funktionen aktualisiert werden. Die weitere Nutzung bedeutet Zustimmung zur jeweils aktuellen In-App-Version."
          )}
        </LegalParagraph>
      </LegalCard>
    </LegalShell>
  );
}
