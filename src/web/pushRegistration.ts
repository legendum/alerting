import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { initializeApp } from "firebase/app";
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

let tried = false;

export async function registerPushIfSupported(): Promise<void> {
  if (tried || typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  tried = true;

  let res: Response;
  try {
    res = await fetch("/api/firebase-config", { credentials: "include" });
  } catch {
    return;
  }
  if (!res.ok) return;
  const data = (await res.json()) as FirebaseConfig;
  if (!data?.vapidPublicKey || !data?.projectId || !data?.messagingSenderId) return;

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

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/alert-sw.js", { scope: "/" });
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

  let token: string;
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
    const title = payload.notification?.title ?? (payload.data as { title?: string } | undefined)?.title ?? "Alert";
    const body = payload.notification?.body ?? (payload.data as { body?: string } | undefined)?.body ?? "";
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/img/red-ball-192.png" });
    }
  });
}
