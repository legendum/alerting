/**
 * Stub: send FCM push. Implement with Firebase Admin or FCM HTTP v1 when config is ready.
 */
export async function sendFcmPush(opts: {
  fcmToken: string;
  title?: string;
  body?: string;
}): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.log("[fcm push]", opts.fcmToken.slice(0, 20) + "...", opts.title ?? opts.body);
  }
}
