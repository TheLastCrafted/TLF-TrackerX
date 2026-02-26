import { useI18n } from "@/src/i18n/use-i18n";
import { LegalBullet, LegalCard, LegalParagraph, LegalShell } from "./_legal-shell";

export default function PrivacyScreen() {
  const { t } = useI18n();

  return (
    <LegalShell
      title={t("Privacy Policy", "Datenschutzerklaerung")}
      subtitle={t("How your data is handled.", "Wie deine Daten verarbeitet werden.")}
    >
      <LegalCard title={t("Local-first storage", "Lokale Speicherung zuerst")}>
        <LegalParagraph>
          {t(
            "TrackerX stores most settings and personal tracking data on your device (for example: watchlist, widgets, portfolio, budgets, and preferences).",
            "TrackerX speichert die meisten Einstellungen und persoenlichen Tracking-Daten lokal auf deinem Geraet (z. B. Watchlist, Widgets, Portfolio, Budgets und Praeferenzen)."
          )}
        </LegalParagraph>
      </LegalCard>

      <LegalCard title={t("What is sent to third parties", "Was an Drittanbieter gesendet wird")}>
        <LegalBullet>
          {t(
            "Market requests send asset symbols/ids and query parameters to data providers so quotes and charts can be returned.",
            "Marktanfragen senden Asset-Symbole/IDs und Query-Parameter an Datenanbieter, damit Kurse und Charts geliefert werden koennen."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "News requests fetch publicly available article feeds and related metadata.",
            "News-Anfragen laden oeffentlich verfuegbare News-Feeds und zugehoerige Metadaten."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "No in-app payment profile or server-side account syncing is enabled in this local build.",
            "In dieser lokalen Build sind kein In-App-Payment-Profil und keine serverseitige Kontosynchronisierung aktiviert."
          )}
        </LegalBullet>
      </LegalCard>

      <LegalCard title={t("Notifications", "Benachrichtigungen")}>
        <LegalParagraph>
          {t(
            "If you enable alerts, notification permission is used to deliver local notifications on your device. You can revoke this in system settings at any time.",
            "Wenn du Alarme aktivierst, wird die Benachrichtigungsfreigabe fuer lokale Benachrichtigungen auf deinem Geraet genutzt. Du kannst dies jederzeit in den Systemeinstellungen widerrufen."
          )}
        </LegalParagraph>
      </LegalCard>

      <LegalCard title={t("Imports", "Datei-Importe")}>
        <LegalBullet>
          {t(
            "Imported statement files are processed to extract portfolio or cashflow rows.",
            "Importierte Konto-/Broker-Dateien werden verarbeitet, um Portfolio- oder Cashflow-Zeilen zu extrahieren."
          )}
        </LegalBullet>
        <LegalBullet>
          {t(
            "You control what you import and can delete imported records in-app.",
            "Du kontrollierst, welche Dateien du importierst, und kannst importierte Eintraege in der App loeschen."
          )}
        </LegalBullet>
      </LegalCard>

      <LegalCard title={t("Your controls", "Deine Steuerung")}>
        <LegalBullet>{t("Change language/currency/theme in Settings.", "Sprache/Waehrung/Theme in den Einstellungen aendern.")}</LegalBullet>
        <LegalBullet>{t("Delete watchlist entries, alerts, and financial records at any time.", "Watchlist-Eintraege, Alarme und Finanzdaten jederzeit loeschen.")}</LegalBullet>
        <LegalBullet>{t("Disable notifications from Settings or system permissions.", "Benachrichtigungen in den Einstellungen oder Systemrechten deaktivieren.")}</LegalBullet>
      </LegalCard>
    </LegalShell>
  );
}
