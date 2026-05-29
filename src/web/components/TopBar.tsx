import { Legendum } from "pues/base/auth";
import { TopBar as PuesTopBar } from "pues/base/objects";
import type { Dispatch, RefObject, SetStateAction } from "react";

type Props = {
  filterQuery: string;
  setFilterQuery: Dispatch<SetStateAction<string>>;
  filterInputRef: RefObject<HTMLInputElement | null>;
  onOpenSettings: () => void;
};

function formatCreditsBalance(cents: number): string {
  return `${cents.toLocaleString()} Credits`;
}

export default function TopBar({
  filterQuery,
  setFilterQuery,
  filterInputRef,
  onOpenSettings,
}: Props) {
  return (
    <PuesTopBar
      logoSrc="/img/inbox-512.png"
      logoTitle="Settings"
      logoAriaLabel="Settings"
      onLogoClick={onOpenSettings}
      filterQuery={filterQuery}
      setFilterQuery={setFilterQuery}
      filterInputRef={filterInputRef}
      filterPlaceholder="Filter…"
      filterAriaLabel="Filter webhooks by name or id"
      filterId="webhooks-filter"
      right={
        <Legendum
          linkLabel="Link Legendum"
          linkingLabel="Linking…"
          errorLabel="Retry"
          formatBalance={formatCreditsBalance}
          lowCreditsThreshold={50}
          pollIntervalMs={60_000}
          autoLogoutOnUnlink
        />
      }
    />
  );
}
