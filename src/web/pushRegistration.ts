import { initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { playAlertChime } from "./alertChime";
import { requestPoll } from "./messages";

type FirebaseConfig = {
  apiKey: string | null;
  authDomain: string | null;
  projectId: string;
  storageBucket: string | null;
  messagingSenderId: string;
  appId: string | null;
  vapidPublicKey: string;
};

let registered = false;
let inFlight = false;

export async function registerPushIfSupported(): Promise<void> {
  if (registered || inFlight || typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  inFlight = true;

  let res: Response;
  try {
    res = await fetch("/api/firebase-config", { credentials: "include" });
  } catch {
    inFlight = false;
    return;
  }
  if (!res.ok) {
    inFlight = false;
    return;
  }
  const data = (await res.json()) as FirebaseConfig;
  if (!data?.vapidPublicKey || !data?.projectId || !data?.messagingSenderId)
    return;

  const firebaseConfig = {
    apiKey: data.apiKey ?? "",
    authDomain: data.authDomain ?? "",
    projectId: data.projectId,
    storageBucket: data.storageBucket ?? "",
    messagingSenderId: data.messagingSenderId,
    appId: data.appId ?? "",
  };

  try {
    const supported = await isSupported();
    if (!supported) {
      inFlight = false;
      return;
    }
  } catch {
    inFlight = false;
    return;
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    inFlight = false;
    return;
  }

  if (Notification.permission === "denied") {
    inFlight = false;
    return;
  }
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      inFlight = false;
      return;
    }
  }

  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  let token: string;
  try {
    token = await getToken(messaging, {
      vapidKey: data.vapidPublicKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    inFlight = false;
    return;
  }
  if (!token) {
    inFlight = false;
    return;
  }

  try {
    const regRes = await fetch("/push/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });
    if (!regRes.ok) {
      inFlight = false;
      return;
    }
  } catch {
    inFlight = false;
    return;
  }

  registered = true;
  inFlight = false;

  // When tab is in foreground, FCM delivers here instead of to the service worker
  onMessage(messaging, (payload) => {
    console.log("[FCM] onMessage received", payload);
    playAlertChime();
    requestPoll(); // Trigger immediate poll so UI updates (badges, quota)
    const title =
      payload.notification?.title ??
      (payload.data as { title?: string } | undefined)?.title ??
      "Alert";
    const body =
      payload.notification?.body ??
      (payload.data as { body?: string } | undefined)?.body ??
      "";
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, icon: "/red-ball.png" });
    }
  });
}
