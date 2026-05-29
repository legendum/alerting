import { FilterBar } from "pues/base/objects";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  id: string;
  placeholder?: string;
  ariaLabel?: string;
};

export default function DetailFilterBar({
  query,
  setQuery,
  id,
  placeholder = "Filter alerts…",
  ariaLabel = "Filter alerts",
}: Props) {
  return (
    <div className="detail-filter-bar">
      <FilterBar
        query={query}
        setQuery={setQuery}
        id={id}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        className="detail-filter-bar-input"
      />
    </div>
  );
}
