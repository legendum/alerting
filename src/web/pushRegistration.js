import { initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { requestPoll } from "./messages";

let tried = false;
export async function registerPushIfSupported() {
  if (tried || typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  tried = true;
  let res;
  try {
    res = await fetch("/api/firebase-config", { credentials: "include" });
  } catch {
    return;
  }
  if (!res.ok) return;
  const data = await res.json();
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
    if (!supported) return;
  } catch {
    return;
  }
  let registration;
  try {
    registration = await navigator.serviceWorker.register("/alert-sw.js", {
      scope: "/",
    });
    await registration.update();
  } catch {
    return;
  }
  if (Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
  }
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  let token;
  try {
    token = await getToken(messaging, {
      vapidKey: data.vapidPublicKey,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return;
  }
  if (!token) return;
  try {
    await fetch("/push/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    });
  } catch {
    // ignore
  }
  // When tab is in foreground, FCM delivers here instead of to the service worker
  console.log("[FCM] onMessage listener attached (foreground)");
  onMessage(messaging, (payload) => {
    console.log("[FCM] onMessage received", payload);
    requestPoll(); // Trigger immediate poll so UI updates (badges, quota)
    const title = payload.notification?.title ?? payload.data?.title ?? "Alert";
    const body = payload.notification?.body ?? payload.data?.body ?? "";
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, icon: "/img/red-ball-192.png" });
    }
  });
}
