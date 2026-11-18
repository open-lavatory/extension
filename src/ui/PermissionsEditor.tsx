import LucideGlobe from "lucide-solid/icons/globe";
import { createResource, createSignal, For, type JSX, Show } from "solid-js";
import * as z from "zod/mini";

import type { Binding, Connection } from "../connections/registry.js";
import { t } from "../i18n/catalogue.js";
import { AccountIdentity } from "./AccountIdentity.js";
import { call } from "./client.js";
import type { UiResult } from "./port.js";

export const PermissionsEditor = (properties: {
  connection: Connection & { binding: Binding; };
  onSaved: () => Promise<void>;
}): JSX.Element => {
  const [accounts] = createResource(async (): Promise<UiResult<string[]>> => {
    try {
      const reply = await call({ kind: "ui:permission-accounts", connectionId: properties.connection.connectionId });

      return reply.for === "ui:permission-accounts" ? reply.result : { ok: false, error: t("errors.extensionDidNotAnswer") };
    }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : t("approval.couldNotLoadAccounts") };
    }
  });
  const available = () => {
    const result = accounts();

    return result?.ok ? [...new Set([...properties.connection.binding.accounts, ...result.value])] : [];
  };
  const [submission, setSubmission] = createSignal<"saving" | UiResult<null>>({ ok: true, value: null });
  const failure = () => {
    const submitted = submission();

    if (submitted !== "saving" && !submitted.ok) return submitted.error;

    const loaded = accounts();

    if (loaded && !loaded.ok) return loaded.error;

    return undefined;
  };
  const save = async (event: SubmitEvent & { currentTarget: HTMLFormElement; }) => {
    event.preventDefault();

    if (submission() === "saving") return;

    const selected = new FormData(event.currentTarget).getAll("account")
      .filter((account): account is string => z.string().safeParse(account).success);

    setSubmission("saving");

    try {
      const reply = await call({
        kind: "ui:permission-save",
        connectionId: properties.connection.connectionId,
        origin: properties.connection.binding.origin,
        accounts: selected,
      });

      if (!reply.result.ok) {
        setSubmission(reply.result);

        return;
      }

      await properties.onSaved();
    }
    catch (error) {
      setSubmission({ ok: false, error: error instanceof Error ? error.message : t("approval.couldNotSubmit") });
    }
  };

  return (
    <form class="permissions-editor" onSubmit={event => void save(event)}>
      <div class="switch-site" title={properties.connection.binding.origin}>
        <span class="switch-site-icon"><LucideGlobe size={18} /></span>
        <strong>{new URL(properties.connection.binding.origin).host}</strong>
      </div>
      <Show when={accounts.loading}><p class="muted" role="status">{t("approval.loadingAccounts")}</p></Show>
      <fieldset class="permission-accounts" disabled={submission() === "saving"}>
        <legend>{t("approval.accountsSiteMaySee")}</legend>
        <div class="permission-account-list">
          <For each={available()}>
            {account => (
              <label class="permission-account">
                <AccountIdentity account={account} />
                <input
                  type="checkbox"
                  name="account"
                  value={account}
                  aria-label={account}
                  checked={properties.connection.binding.accounts.some(value => value.toLowerCase() === account.toLowerCase())}
                />
              </label>
            )}
          </For>
        </div>
      </fieldset>
      <Show when={failure()}>{message => <p class="bad" role="alert">{message()}</p>}</Show>
      <button type="submit" class="primary full permission-save" disabled={submission() === "saving" || accounts.state !== "ready" || !accounts()?.ok}>{t("actions.savePermissions")}</button>
    </form>
  );
};
