import LucidePlus from "lucide-solid/icons/plus";
import LucideTrash2 from "lucide-solid/icons/trash-2";
import { createSignal, Index, type JSX } from "solid-js";

import { t } from "../i18n/catalogue.js";

type TurnServer = { urls: string; username: string; credential: string; };

export const TransportSettings = (properties: {
  value: RTCConfiguration;
  onChange: (rtcConfig: RTCConfiguration) => void;
}): JSX.Element => {
  const initial = (properties.value.iceServers ?? []).flatMap(server =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).map(urls => ({
      urls,
      username: server.username ?? "",
      credential: server.credential ?? "",
    })),
  );
  const [stunServers, setStunServers] = createSignal(
    initial.filter(server => /^stuns?:/u.test(server.urls)).map(server => server.urls),
  );
  const [turnServers, setTurnServers] = createSignal<TurnServer[]>(
    initial.filter(server => !/^stuns?:/u.test(server.urls)),
  );

  const save = () => {
    properties.onChange({
      iceServers: [
        ...stunServers().filter(server => server.trim() !== "")
          .map(urls => ({ urls: urls.trim() })),
        ...turnServers().filter(server => server.urls.trim() !== "")
          .map(server => ({
            urls: server.urls.trim(),
            username: server.username,
            credential: server.credential,
          })),
      ],
    });
  };

  const updateStun = (index: number, value: string) => {
    setStunServers(current => current.map((server, position) => (position === index ? value : server)));
    save();
  };

  const updateTurn = (index: number, field: keyof TurnServer, value: string) => {
    setTurnServers(current => current.map((server, position) => (position === index ? { ...server, [field]: value } : server)));
    save();
  };

  return (
    <div class="transport-settings">
      <section class="server-group" aria-labelledby="stun-label">
        <span class="field-label" id="stun-label">{t("settings.transport.iceServers.stun")}</span>
        <div class="server-list">
          <Index each={stunServers()}>
            {(server, index) => (
              <div class="server-row">
                <input
                  aria-label={t("transport.stunServer", { number: index + 1 })}
                  dir="ltr"
                  value={server()}
                  onInput={event => updateStun(index, event.currentTarget.value)}
                  placeholder="stun:stun.l.google.com:19302"
                  spellcheck={false}
                />
                <button
                  type="button"
                  class="icon-button small"
                  aria-label={t("transport.removeStunServer", { number: index + 1 })}
                  onClick={() => {
                    setStunServers(current => current.filter((_, position) => position !== index));
                    save();
                  }}
                >
                  <LucideTrash2 />
                </button>
              </div>
            )}
          </Index>
          <button type="button" class="add-server" onClick={() => setStunServers(current => [...current, ""])}>
            <LucidePlus />
            {t("settings.transport.iceServers.addStun")}
          </button>
        </div>
      </section>
      <section class="server-group" aria-labelledby="turn-label">
        <span class="field-label" id="turn-label">{t("settings.transport.iceServers.turn")}</span>
        <div class="server-list">
          <Index each={turnServers()}>
            {(server, index) => (
              <div class="turn-server">
                <div class="server-row">
                  <input
                    aria-label={t("transport.turnServer", { number: index + 1 })}
                    dir="ltr"
                    value={server().urls}
                    onInput={event => updateTurn(index, "urls", event.currentTarget.value)}
                    placeholder="turn:relay.example.com:443"
                    spellcheck={false}
                  />
                  <button
                    type="button"
                    class="icon-button small"
                    aria-label={t("transport.removeTurnServer", { number: index + 1 })}
                    onClick={() => {
                      setTurnServers(current => current.filter((_, position) => position !== index));
                      save();
                    }}
                  >
                    <LucideTrash2 />
                  </button>
                </div>
                <div class="turn-auth">
                  <input
                    aria-label={t("transport.username", { number: index + 1 })}
                    value={server().username}
                    onInput={event => updateTurn(index, "username", event.currentTarget.value)}
                    placeholder={t("settings.transport.iceServers.username")}
                    autocomplete="off"
                  />
                  <input
                    type="password"
                    aria-label={t("transport.password", { number: index + 1 })}
                    value={server().credential}
                    onInput={event => updateTurn(index, "credential", event.currentTarget.value)}
                    placeholder={t("settings.transport.iceServers.credential")}
                    autocomplete="off"
                  />
                </div>
              </div>
            )}
          </Index>
          <button type="button" class="add-server" onClick={() => setTurnServers(current => [...current, { urls: "", username: "", credential: "" }])}>
            <LucidePlus />
            {t("settings.transport.iceServers.addTurn")}
          </button>
        </div>
      </section>
    </div>
  );
};
