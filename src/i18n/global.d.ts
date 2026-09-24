import type messages from "../../messages/es.json";
import type { Locale } from "./config";

// Type-checks translation keys against the Spanish source file.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
