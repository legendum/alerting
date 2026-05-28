# FCM (Firebase Cloud Messaging) setup

To get push notifications working for the Alert PWA and backend, set up Firebase and put the values in **config/alerting.yaml**. Use **config/alerting.example.yaml** as a template (copy to `alerting.yaml` and fill in). The file `config/alerting.yaml` is gitignored so secrets are not committed.

---

## 1. Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (or use an existing one).
3. Note the **Project ID** (used in the FCM API URL).

---

## 2. Web app in Firebase

1. In the project: **Project overview** → **Add app** → **Web** (</>).
2. Register the app (e.g. “Alert PWA”) and copy the **Firebase config** object.

It looks like:

```js
{
  apiKey: "...",
  authDomain: "<project>.firebaseapp.com",
  projectId: "<project-id>",
  storageBucket: "<project>.appspot.com",
  messagingSenderId: "...",
  appId: "..."
}
```

**Put in config/alerting.yaml** under `firebase.project_id` and `firebase.messaging_sender_id` (and optionally other fields for the frontend).

---

## 3. Web Push key pair (VAPID)

1. In Firebase: **Project settings** (gear) → **Cloud Messaging** tab.
2. Under **Web configuration** (or “Web Push certificates”), click **Generate key pair**.
3. You get a key pair (public + private).

**Put in config/alerting.yaml:**

- **Public key** → `firebase.vapid_public_key` (frontend and service worker).
- **Private key** → `firebase.vapid_private_key` (backend only; keep secret).

---

## 4. Service account (backend sending)

1. In Firebase: **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** and download the JSON key file.
3. The file contains `client_email`, `private_key`, `project_id`, etc.

**Put in config/alerting.yaml:** `firebase.service_account_path` — path to the JSON key file (e.g. `./secrets/firebase-service-account.json`). Alternatively set the `GOOGLE_APPLICATION_CREDENTIALS` env var instead; the backend uses one or the other to call the FCM HTTP v1 API.

---

## Summary — config/alerting.yaml

| What | Key in alerting.yaml | Used by |
|------|-------------------|--------|
| Firebase project ID, messaging sender ID | `firebase.project_id`, `firebase.messaging_sender_id` | Frontend (init Firebase, get FCM token) |
| VAPID **public** key | `firebase.vapid_public_key` | Frontend / service worker (push subscription) |
| VAPID **private** key | `firebase.vapid_private_key` | Backend (send push) — keep secret |
| Service account JSON **path** | `firebase.service_account_path` | Backend (FCM HTTP v1); or use `GOOGLE_APPLICATION_CREDENTIALS` env |

---

## Optional

- Add more Firebase fields to `config/alerting.yaml` (e.g. `api_key`, `auth_domain`, `app_id`) if the frontend needs the full config object.
- **domain** in `config/alerting.yaml` is set to `https://alerting.app`; use it for CORS and Web Push origin if needed.

---

## Flow once configured

1. **Frontend:** Uses Firebase config + VAPID public key to request notification permission and get an FCM token; sends the token to the backend via `POST /push/register`.
2. **Backend:** Stores the token (per token_hash). When a webhook is triggered, uses the service account (and optionally VAPID private key) to call FCM and send a push to that token.
3. **Service worker:** Handles the `push` event and displays the notification; optionally `notificationclick` to focus the app.
