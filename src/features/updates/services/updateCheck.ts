import { openUrl } from "@tauri-apps/plugin-opener";

import { getErrorDescription, handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { notifyPending } from "@/lib/toast";

import { checkForUpdates, isCheckForUpdatesError, type UpdateCheck } from "./updateCheckApi";

let checkInFlight: Promise<void> | null = null;

const openReleasePage = async (releaseUrl: string) => {
  try {
    await openUrl(releaseUrl);
  } catch (error) {
    notifyOperationFailure(t("updates.openReleaseFailed"), error, "updates.openReleasePage");
  }
};

const getFailureDescription = (error: unknown) => {
  if (!isCheckForUpdatesError(error)) {
    handleUnexpectedError(error, "updates.check");
    return getErrorDescription(error);
  }

  switch (error.kind) {
    case "network":
      return t("updates.failed.network");

    case "timeout":
      return t("updates.failed.timeout");

    case "rateLimited":
      return t("updates.failed.rateLimited");

    case "unexpectedResponse":
      return t("updates.failed.unexpectedResponse");
  }
};

const runUpdateCheck = async () => {
  const settle = notifyPending(t("updates.checking"));
  let result: UpdateCheck;

  try {
    result = await checkForUpdates();
  } catch (error) {
    settle("error", {
      title: t("updates.failed.title"),
      description: getFailureDescription(error),
    });
    return;
  }

  if (result.kind === "upToDate") {
    settle("success", {
      title: t("updates.upToDate.title"),
      description: t("updates.upToDate.description", { version: result.currentVersion }),
    });
    return;
  }

  const { releaseUrl } = result;

  settle(
    "info",
    {
      title: t("updates.available.title", { version: result.version }),
      description: t("updates.available.description", { version: result.currentVersion }),
    },
    {
      label: t("updates.available.viewRelease"),
      run: () => void openReleasePage(releaseUrl),
    },
  );
};

/** Checks the release list once; choosing the command again during a check joins it. */
export const checkForNewerRelease = () => {
  checkInFlight ??= runUpdateCheck().finally(() => {
    checkInFlight = null;
  });

  return checkInFlight;
};
