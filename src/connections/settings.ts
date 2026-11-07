import { storage } from "wxt/utils/storage";

export const transportStore = storage.defineItem<RTCConfiguration>(
  "local:transport",
  { fallback: { iceServers: [] } },
);
