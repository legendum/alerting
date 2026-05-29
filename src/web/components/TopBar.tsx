import { Legendum } from "pues/base/auth";
import { TopBar as PuesTopBar } from "pues/base/objects";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { APP_LOGO_SRC } from "../appIcons";

type Props = {
  filterQuery: string;
  setFilterQuery: Dispatch<SetStateAction<string>>;
  filterInputRef: RefObject<HTMLInputElement | null>;
  /** True on webhook detail and All Alerts — same top-bar input, different target. */
  filterTargetsAlerts?: boolean;
  onOpenSettings: () => void;
};

function formatCreditsBalance(cents: number): string {
  return `${cents.toLocaleString()} Credits`;
}

export default function TopBar({
  filterQuery,
  setFilterQuery,
  filterInputRef,
  filterTargetsAlerts = false,
  onOpenSettings,
}: Props) {
  return (
    <PuesTopBar
      logoSrc={APP_LOGO_SRC}
      logoTitle="Settings"
      logoAriaLabel="Settings"
      onLogoClick={onOpenSettings}
      filterQuery={filterQuery}
      setFilterQuery={setFilterQuery}
      filterInputRef={filterInputRef}
      filterPlaceholder="Filter…"
      filterAriaLabel={
        filterTargetsAlerts
          ? "Filter alerts by title, body, or time"
          : "Filter webhooks by name or id"
      }
      filterId="app-filter"
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
