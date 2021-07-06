import {
  BaseHandler,
  FileHandler,
} from "https://deno.land/std@0.99.0/log/handlers.ts";
import { LogRecord } from "https://deno.land/std@0.99.0/log/logger.ts";
import { LevelName, setup } from "https://deno.land/std@0.99.0/log/mod.ts";
import { StringReader } from "https://deno.land/std@0.99.0/io/mod.ts";

export { getLogger } from "https://deno.land/std@0.99.0/log/mod.ts";
export type { LevelName } from "https://deno.land/std@0.99.0/log/mod.ts";

export const allowedLevels = ["DEBUG", "INFO", "WARNING"] as const;

interface BaseOptions {
  additionalProps: Record<string, any>;
  spacing: number;
}

type ConsoleOptions = Partial<BaseOptions>;
type FileOptions = ConsoleOptions & { filename: string };

function isObject(item: any): item is Object {
  return typeof item === "object" && item !== null;
}

function isFileOptions(item: any): item is FileOptions {
  return isObject(item) && typeof item.filename == "string";
}

function makeJSONFormatter({ additionalProps, spacing }: ConsoleOptions) {
  return ({ msg, args, datetime, levelName }: LogRecord) =>
    JSON.stringify(
      {
        date: datetime.toISOString(),
        level: levelName,
        payload: msg,
        ...additionalProps,
        ...(args.length > 0 && isObject(args[0]) ? args[0] : {}),
      },
      null,
      spacing,
    );
}

class StdOutHandler extends BaseHandler {
  constructor(levelName: LevelName, options: ConsoleOptions) {
    const formatter = makeJSONFormatter(options);
    super(levelName, { formatter });
  }

  async log(msg: string): Promise<void> {
    const buf = new StringReader(msg + "\n");
    await Deno.copy(buf, Deno.stdout);
  }
}

class StdErrorHandler extends BaseHandler {
  constructor(levelName: LevelName, options: ConsoleOptions) {
    const formatter = makeJSONFormatter(options);
    super(levelName, { formatter });
  }

  async log(msg: string): Promise<void> {
    const buf = new StringReader(msg + "\n");
    await Deno.copy(buf, Deno.stderr);
  }
}

class OutputFileHandler extends FileHandler {
  constructor(levelName: LevelName, { filename, ...rest }: FileOptions) {
    const formatter = makeJSONFormatter(rest);
    super(levelName, { formatter, filename, mode: "w" });
  }
}

export function setLogger(
  levelName: LevelName,
  options?: Partial<FileOptions>,
) {
  let handlers: Record<string, BaseHandler> = {
    stdOut: new StdOutHandler(levelName, options ?? {}),
    stdErr: new StdErrorHandler(levelName, options ?? {}),
  };

  if (isFileOptions(options)) {
    handlers = {
      ...handlers,
      file: new OutputFileHandler(levelName, options),
    };
  }

  return setup({
    handlers,
    loggers: {
      app: {
        level: "DEBUG",
        handlers: ["stdErr"],
      },
      events: {
        level: "DEBUG",
        handlers: ["stdOut", "file"],
      },
    },
  });
}
