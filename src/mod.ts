import { createHash } from "https://deno.land/std@0.99.0/hash/mod.ts";
import { ensureFileSync } from "https://deno.land/std@0.99.0/fs/mod.ts";
import { resolve, sep } from "https://deno.land/std@0.99.0/path/mod.ts";
import {
  Command,
  EnumType,
  ITypeInfo,
} from "https://deno.land/x/cliffy@v0.19.2/mod.ts";
import { allowedLevels, getLogger, LevelName, setLogger } from "./logger.ts";
import { AppSyncWebSocket } from "./appsync_ws.ts";

const logLevelType = new EnumType(allowedLevels.map((l) => l.toLowerCase()));

function pathEnsureType({ value }: ITypeInfo) {
  const path = resolve(...value.split(sep));
  ensureFileSync(path);

  return path;
}

interface Options {
  logLevel: LevelName;
  output?: string;
  query?: string[];
}

const cmd = (new Command<Options>())
  .type("log-level", logLevelType)
  .type("path-ensure", pathEnsureType)
  .option(
    "-q, --query <query:string>",
    "Subscription query to request.",
    { collect: true },
  )
  .option(
    "--log-level <level:log-level>",
    "Set logging level.",
    {
      default: "info",
      value: (a: string) => a.toUpperCase(),
    },
  )
  .option(
    "-o, --output <path:path-ensure>",
    "File path to write captured output",
  )
  .env(
    "GRAPH_API_KEY=<value:string>",
    "AWS AppSync Api Key to be passed to the server.",
  )
  .env(
    "GRAPH_ENDPOINT_URL=<value:string>",
    "AWS AppSync Endpoint to be queried.",
  );

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

async function main(options: Options) {
  const GRAPH_API_KEY = Deno.env.get("GRAPH_API_KEY");
  const GRAPH_ENDPOINT_URL = Deno.env.get("GRAPH_ENDPOINT_URL");

  await setLogger(options.logLevel, { filename: options.output });
  const appLog = getLogger("app");
  const evtLog = getLogger("events");
  const controller = new AbortController();
  const client = new AppSyncWebSocket({
    endpoint: GRAPH_ENDPOINT_URL ?? "",
    auth: {
      kind: "api_key",
      apiKey: GRAPH_API_KEY ?? "",
    },
    abortController: controller,
  });

  client.on("request", (e) => {
    appLog.debug(e, { direction: "outbound" });
  });

  client.on("response", (e) => {
    // Skip keep-alive and data messages.
    if (e.type !== "data" && e.type !== "ka") {
      appLog.info(e, { direction: "inbound" });
    }
  });

  await client.connect();

  for (const query of options.query ?? []) {
    (async () => {
      const sub = await client.subscribe({ query });
      const hash = createHash("md5").update(query).toString();
      evtLog.debug(`Starting subscription: ${hash}`);

      for await (const evt of sub) {
        evtLog.info(evt, { direction: "inbound", hash });
      }

      evtLog.debug(`Stopping subscription: ${hash}`);
    })();
  }

  await shutdownHandler(controller, client.done);
  Deno.exit(0); // force exit once shutdown complete
}

if (import.meta.main) {
  const { options } = await cmd.parse(Deno.args);
  await main(options);
}
