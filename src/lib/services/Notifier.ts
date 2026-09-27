import OBR from "@owlbear-rodeo/sdk";
import { get } from "svelte/store";
import { pushNotification } from "./NotificationLogger";
import { pluginId } from "./OBRHelper";
import { Settings } from "./SettingsTracker";

export const NOTIFICATION_KEY = pluginId("notification");

export type NotifyOptions = {
  secret?: boolean;
};

export async function notify(msg: string, options: NotifyOptions = {}) {
  if (!OBR.isAvailable) {
    pushNotification(msg);
    return;
  }

  const myName = await OBR.player.getName();
  const m = `${myName}: ${msg}`;

  if (options.secret) {
    showPopover(`Secret: ${m}`);
  } else {
    OBR.broadcast.sendMessage(NOTIFICATION_KEY, m);
    showPopover(m);
  }
}

let timeoutHandle: ReturnType<typeof setTimeout>;

export async function showPopover(msg: string) {
  pushNotification(msg);
  const popoverId = pluginId("popover");
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  try {
    await OBR.popover.open({
      id: popoverId,
      url: new URL(`popover.html?msg=${encodeURIComponent(msg)}`, window.location.href).toString(),
      height: 100,
      width: 400,
    });
    timeoutHandle = setTimeout(
      () => {
        OBR.popover.close(popoverId);
      },
      (get(Settings).popoverDuration ?? 5) * 1000,
    );
  } catch {
    // popovers aren't available in every context (e.g. outside a room)
  }
}
