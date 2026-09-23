import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiUrl } from "./apiBase.js";

const TOKEN_KEY = "trademindmz-push-token";
let initialized = false;

async function registerToken(token) {
  const value = String(token || "").trim();
  if (!value) return;

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

    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") {
      const requested = await PushNotifications.requestPermissions();
      if (requested.receive !== "granted") return;
    }

    await PushNotifications.register();
  } catch (error) {
    // Push setup must never prevent the trading terminal from starting.
    console.warn("TradeMindMZ push notifications unavailable:", error);
  }
}
