import { AppSyncWebSocket } from "./appsync_ws.ts";

const GRAPH_API_KEY = Deno.env.get("GRAPH_API_KEY");
const GRAPH_ENDPOINT_URL = Deno.env.get("GRAPH_ENDPOINT_URL");

async function shutdownHandler(
  controller: AbortController,
  done: Promise<void>,
) {
  const interrupt = Deno.signal(Deno.Signal.SIGINT);

  const immediate = async () => {
    console.error("To halt immediately press '^C' again.");

    await interrupt;
    console.error("Halting.");
  };

  const graceful = async () => {
    console.error("Gracefully stopping running tasks.");
    controller.abort();
    await done;
    console.error("Shutdown complete.");
  };

  await interrupt;
  await Promise.race([immediate(), graceful()]);
  interrupt.dispose();
}

async function main() {
  const controller = new AbortController();
  const client = new AppSyncWebSocket({
    endpoint: GRAPH_ENDPOINT_URL ?? "",
    auth: {
      kind: "api_key",
      apiKey: GRAPH_API_KEY ?? "",
    },
    abortController: controller,
  });

  client.on("request", (e) => console.log(e));

  client.on("response", (e) => {
    if (e.type !== "data") {
      console.log(e);
    }
  });

  await client.connect();

  const iter = await client.subscribe({
    query: `subscription onNewMessage {
      onNewMessage{
        __typename
        id
        to
        subject
        body
      }
    }`,
  });

  (async () => {
    console.log("Starting subscription.");

    for await (const v of iter) {
      console.log(v);
    }

    console.log("Ended subscription.");
  })();

  await shutdownHandler(controller, client.done);
  Deno.exit(0); // force exit once shutdown complete
}

if (import.meta.main) {
  await main();
}
