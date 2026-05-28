import { Dialog } from "pues/base/objects";
import { useEffect, useRef, useState } from "react";
import CopyIcon from "./CopyIcon";

const COPY_ACK_MS = 850;

type Props = {
  webhookUrl: string;
  onClose: () => void;
};

export function webhookTriggerUrl(ulid: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/w/${ulid}`;
}

export default function WebhookTriggerDialog({ webhookUrl, onClose }: Props) {
  const [urlCopiedFlash, setUrlCopiedFlash] = useState(false);
  const copyFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getExample = `${webhookUrl}?title=Hello&body=World`;
  const postExampleBody = JSON.stringify(
    { title: "Hello", body: "World" },
    null,
    2,
  );

  useEffect(
    () => () => {
      if (copyFlashTimer.current) clearTimeout(copyFlashTimer.current);
    },
    [],
  );

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      if (copyFlashTimer.current) clearTimeout(copyFlashTimer.current);
      setUrlCopiedFlash(true);
      copyFlashTimer.current = setTimeout(() => {
        setUrlCopiedFlash(false);
        copyFlashTimer.current = null;
      }, COPY_ACK_MS);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Dialog title="Trigger webhook" onClose={onClose}>
      <section className="pues-dialog-section">
        <div className="pues-dialog-section-head">
          <h3>Webhook URL</h3>
          {urlCopiedFlash ? (
            <span className="pues-dialog-copy-hint" role="status">
              Copied
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`pues-dialog-code-install-wrap${urlCopiedFlash ? " pues-dialog-code--flash" : ""}`}
          onClick={copyWebhookUrl}
          aria-label="Copy webhook URL"
        >
          <span className="pues-dialog-code-install-scroll">{webhookUrl}</span>
          <span className="pues-dialog-code-install-icon" aria-hidden="true">
            <CopyIcon />
          </span>
        </button>
      </section>

      <section className="pues-dialog-section">
        <h3>Optional parameters</h3>
        <p>
          Send <code>title</code> and <code>body</code> as query parameters
          (GET) or JSON fields (POST) to customize the alert.
        </p>
      </section>

      <section className="pues-dialog-section">
        <h3>GET</h3>
        <pre className="pues-dialog-code">{getExample}</pre>
      </section>

      <section className="pues-dialog-section">
        <h3>POST (JSON)</h3>
        <pre className="pues-dialog-code">{postExampleBody}</pre>
      </section>
    </Dialog>
  );
}
