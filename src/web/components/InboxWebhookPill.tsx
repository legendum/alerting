import { webhookPillClassNames } from "../webhookPill";

type Props = {
  webhookUlid: string;
  name: string;
};

/** Webhook label pill — All Alerts inbox rows only. */
export default function InboxWebhookPill({ webhookUlid, name }: Props) {
  return (
    <span className={webhookPillClassNames(webhookUlid)} title={name}>
      {name}
    </span>
  );
}
