import { ArrowSyncRegular } from "@fluentui/react-icons";
import { cx } from "../../lib/utils";
import { Button } from "./Button";
import { useI18n } from "../../lib/i18n";

// RefreshButton: primary toolbar refresh button with a spin-on-load sync icon.
// Default size so it matches the other action buttons in page headers/toolbars.
export function RefreshButton({ loading, onClick }: { loading?: boolean; onClick?: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      variant="primary"
      onClick={onClick}
      disabled={loading}
      className="!border-0 !shadow-none"
      icon={<ArrowSyncRegular className={cx("transition-transform duration-500", loading && "animate-spin")} />}
    >
      {t("刷新")}
    </Button>
  );
}
