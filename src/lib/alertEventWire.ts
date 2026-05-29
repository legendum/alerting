/** Wire shape for a webhook alert event (API, SSE, and web). */

export type AlertEventWire = {
  id: number;
  webhook_ulid: string;
  webhook_name: string;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};
