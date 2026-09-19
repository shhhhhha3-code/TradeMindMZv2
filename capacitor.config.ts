import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.trademindmz.app",
  appName: "TMZ21",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
