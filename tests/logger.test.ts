import { describe, expect, it, vi } from "vitest";
import { Logger } from "../src/logger.js";

describe("Logger level filtering", () => {
  it("error level: logs error, suppresses warn and info", () => {
    const logger = new Logger("error");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("warn level: logs warn and error, suppresses info", () => {
    const logger = new Logger("warn");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("info level: logs info, warn, and error", () => {
    const logger = new Logger("info");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("unknown level defaults to info behaviour", () => {
    const logger = new Logger("verbose");
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("info message");

    expect(infoSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });

  it("log output contains the message text", () => {
    const logger = new Logger("info");
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("unique message text");

    expect(infoSpy.mock.calls[0]).toContain("unique message text");

    vi.restoreAllMocks();
  });
});
