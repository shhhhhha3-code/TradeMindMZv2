import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiUrl } from "./apiBase.js";

const TOKEN_KEY = "trademindmz-push-token";
const ENABLED_KEY = "trademindmz-push-enabled";
let initialized = false;

function isEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== "false";
}

async function updateServerPreference(enabled) {
  try {
    await fetch(apiUrl("/api/notifications/preferences"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        enabled: Boolean(enabled),
        platform: Capacitor.getPlatform(),
        appId: "com.trademindmz.app",
      }),
    });
  } catch (error) {
    console.warn("TradeMindMZ push preference update failed:", error);
  }
}

async function registerToken(token) {
  const value = String(token || "").trim();
  if (!value || !isEnabled()) return;

  localStorage.setItem(TOKEN_KEY, value);

  try {
    await fetch(apiUrl("/api/notifications/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        token: value,
        platform: Capacitor.getPlatform(),
        appId: "com.trademindmz.app",
      }),
    });
  } catch (error) {
    console.warn("TradeMindMZ push token registration failed:", error);
  }
}

export async function setQualifiedTradeNotificationsEnabled(enabled) {
  const value = Boolean(enabled);
  localStorage.setItem(ENABLED_KEY, String(value));

  if (!Capacitor.isNativePlatform()) return;

  await updateServerPreference(value);

  if (value) {
    try {
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        const requested = await PushNotifications.requestPermissions();
        if (requested.receive !== "granted") return;
      }
      await PushNotifications.register();
    } catch (error) {
      console.warn("TradeMindMZ push re-enable failed:", error);
    }
  }
}

export async function initTradePushNotifications() {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;

  try {
    await PushNotifications.addListener("registration", ({ value }) => {
      registerToken(value);
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.warn("TradeMindMZ push registration error:", error);
    });

    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        window.dispatchEvent(
          new CustomEvent("trademindmz-qualified-trade-notification", {
            detail: notification,
          })
        );
      }
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event) => {
        const data = event?.notification?.data || {};
        if (String(data?.type || "").toUpperCase() === "QUALIFIED_TRADE") {
          window.dispatchEvent(
            new CustomEvent("trademindmz-open-signals", {
              detail: data,
            })
          );
        }
      }
    );

    await PushNotifications.createChannel({
      id: "qualified-trades",
      name: "Qualified trades",
      description: "TradeMindMZ qualified trade alerts",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    });

    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") {
      const requested = await PushNotifications.requestPermissions();
      if (requested.receive !== "granted") return;
    }

    if (!isEnabled()) return;

    await PushNotifications.register();
  } catch (error) {
    // Push setup must never prevent the trading terminal from starting.
    console.warn("TradeMindMZ push notifications unavailable:", error);
  }
}
