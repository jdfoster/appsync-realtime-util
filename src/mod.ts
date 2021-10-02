import { createHash } from "https://deno.land/std@0.99.0/hash/mod.ts";
import { ensureFileSync } from "https://deno.land/std@0.99.0/fs/mod.ts";
import { resolve, sep } from "https://deno.land/std@0.99.0/path/mod.ts";
import {
  Command,
  EnumType,
  ITypeInfo,
  ValidationError,
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
  silent: boolean;
  timeout?: number;
  header?: Record<string, string>[];
}

const cmd = (new Command<Options>())
  .type("log-level", logLevelType)
  .type("path-ensure", pathEnsureType)
  .option(
    "-q, --query <query:string>",
    "Subscription query(ies) to request.",
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
  .option(
    "--silent [silent:boolean]",
    "Disable logging to the console.",
    { default: false },
  )
  .option(
    "-t, --timeout <timeout:integer>",
    "Duration in seconds to collect output.",
  )
  .option(
    "--header <header:string>",
    "Header(s) to be forwarded to server with query(ies); colon separated key/value pairs.",
    {
      collect: true,
      value: (
        current: string,
        previous: Record<string, string>[] = [],
      ): Record<string, string>[] => {
        const header = current.split(":", 2);

        if (header.length !== 2) {
          throw new ValidationError(
            `Header must be a colon (":") separate string, but got "${current}".`,
            { exitCode: 1 },
          );
        }

        return [...previous, { [header[0]]: header[1] }];
      },
    },
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
  const interrupt = Deno.signal("SIGINT");

  const immediate = async () => {
    console.error("To halt immediately press '^C' again.");

    await interrupt;
    console.error("Halting.");
  };

  const graceful = async () => {
    console.error("Gracefully stopping running tasks.");
    controller.abort();
    await done;
  };

  const handler = async () => {
    await interrupt;
    await Promise.race([immediate(), graceful()]);
  };

  await Promise.race([done, handler()]);
  console.error("Shutdown complete.");
  interrupt.dispose();
}

async function main(
  { logLevel, output, silent, query, timeout, header }: Options,
) {
  const GRAPH_API_KEY = Deno.env.get("GRAPH_API_KEY");
  const GRAPH_ENDPOINT_URL = Deno.env.get("GRAPH_ENDPOINT_URL");
  const headers = header?.reduce((prev, curr) => ({ ...prev, ...curr }), {});

  await setLogger(
    logLevel,
    {
      filename: output,
      silent,
    },
  );

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

  for (const q of query ?? []) {
    (async () => {
      try {
        if (controller.signal.aborted) return;
        const sub = await client.subscribe({ query: q, headers });
        const hash = createHash("md5").update(q).toString();
        evtLog.debug(`Starting subscription: ${hash}`);

        for await (const evt of sub) {
          evtLog.info(evt, { direction: "inbound", hash });
        }

        evtLog.debug(`Stopping subscription: ${hash}`);
      } catch (err) {
        evtLog.error(err);

        // delay abort signal to permit recording of event log.
        setTimeout(() => {
          console.error("Encountered an error; shutting down.");
          controller.abort();
        }, 200);
      }
    })();
  }

  if (timeout !== undefined) {
    setTimeout(() => {
      console.log("Timeout reached; shutting down.");
      controller.abort();
    }, timeout * 1000);
  }

  await shutdownHandler(controller, client.done);
  Deno.exit(0); // force exit once shutdown complete
}

if (import.meta.main) {
  const { options } = await cmd.parse(Deno.args);
  await main(options);
}
