import { inboxWebhookPillIndex } from "../inboxWebhookPill";

type Props = {
  webhookUlid: string;
  name: string;
};

/** Webhook label pill — All Alerts inbox rows only. */
export default function InboxWebhookPill({ webhookUlid, name }: Props) {
  const index = inboxWebhookPillIndex(webhookUlid);
  return (
    <span
      className={`inbox-webhook-pill inbox-webhook-pill--${index}`}
      title={name}
    >
      {name}
    </span>
  );
}
