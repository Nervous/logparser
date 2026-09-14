// Regions and their server instances. The admin picks region + server before login,
// which selects the matching UCP OAuth provider and the Loki `region`/`server` labels.

export type RegionKey = "en" | "fr" | "es" | "tr" | "kr";

export interface ServerInstance {
  key: string; // Loki `server` label value
  label: string; // shown in the picker
}

export interface Region {
  key: RegionKey;
  label: string;
  flag: string; // emoji for the picker
  servers: ServerInstance[];
}

export const REGIONS: Region[] = [
  {
    key: "en",
    label: "English",
    flag: "🇬🇧",
    servers: [
      { key: "en", label: "EN — Text" },
      // { key: "en-voice", label: "EN — Voice" }, // enable when the voice server ships
    ],
  },
  { key: "fr", label: "French", flag: "🇫🇷", servers: [{ key: "fr", label: "FR" }] },
  { key: "es", label: "Spanish", flag: "🇪🇸", servers: [{ key: "es", label: "ES" }] },
  { key: "tr", label: "Turkish", flag: "🇹🇷", servers: [{ key: "tr", label: "TR" }] },
  { key: "kr", label: "Korean", flag: "🇰🇷", servers: [{ key: "kr", label: "KR" }] },
];

export function getRegion(key: string): Region | undefined {
  return REGIONS.find((r) => r.key === key);
}

export function isRegionKey(key: string): key is RegionKey {
  return REGIONS.some((r) => r.key === key);
}
