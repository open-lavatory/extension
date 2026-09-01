type Eip1193Provider = {
  request: (call: { method: string; params?: unknown; }) => Promise<unknown>;
};

type ProviderDetail = {
  info: { uuid: string; name: string; rdns: string; };
  provider: Eip1193Provider;
};

const found = new Map<string, ProviderDetail>();
const list = document.querySelector("#providers");
const result = document.querySelector("#result");
const picked: { detail?: ProviderDetail; } = {};

const show = (text: string) => {
  if (result) result.textContent = text;
};

const render = () => {
  if (!list) return;

  list.textContent = "";

  for (const detail of found.values()) {
    const item = document.createElement("li");

    item.textContent = `${detail.info.name} (${detail.info.rdns})`;
    item.dataset["rdns"] = detail.info.rdns;
    list.append(item);
  }
};

globalThis.addEventListener("eip6963:announceProvider", (event) => {
  const detail = (event as CustomEvent<ProviderDetail>).detail;

  found.set(detail.info.rdns, detail);
  picked.detail ??= detail;
  render();
});

globalThis.dispatchEvent(new Event("eip6963:requestProvider"));

document.querySelector("#connect")?.addEventListener("click", () => {
  void (async () => {
    if (!picked.detail) {
      show("no provider announced");

      return;
    }

    try {
      const accounts = await picked.detail.provider.request({
        method: "eth_requestAccounts",
      });

      document.body.dataset["accounts"] = JSON.stringify(accounts);
      show(`accounts: ${JSON.stringify(accounts)}`);
    }
    catch (error) {
      show(error instanceof Error ? error.message : "request failed");
    }
  })();
});

document.querySelector("#sign")?.addEventListener("click", () => {
  void (async () => {
    if (!picked.detail) return;

    const accounts: unknown = JSON.parse(
      document.body.dataset["accounts"] || "[]",
    );
    const account = Array.isArray(accounts) ? accounts[0] : undefined;

    try {
      const signature = await picked.detail.provider.request({
        method: "personal_sign",
        params: ["0x68656c6c6f", account],
      });

      show(`signature: ${String(signature)}`);
    }
    catch (error) {
      show(error instanceof Error ? error.message : "request failed");
    }
  })();
});
