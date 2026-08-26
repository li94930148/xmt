import fs from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";
import { BrowserRegistry } from "../core/browser/registry.js";
import { discoverBrowsers } from "../core/browser/discovery.js";
import {
  assertManagedProfile,
  managedProfile,
} from "../core/browser/profile.js";
import { runCreatorCollectorTask } from "../core/collector/taskRunner.js";
import type { AgentConfig } from "../core/types.js";

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const rounds = Math.max(1, Number(argument("--rounds") || 1));
const platform = argument("--platform") || "douyin";
const requireExports = process.argv.includes("--exports");
app.setName("XMT Creator Agent");
async function main() {
  await app.whenReady();
  const dataRoot = app.getPath("userData");
  const config = JSON.parse(
    await fs.readFile(path.join(dataRoot, "config.json"), "utf8"),
  ) as AgentConfig;
  const token = safeStorage.decryptString(
    await fs.readFile(path.join(dataRoot, "agent-token.bin")),
  );
  if (platform !== config.platform)
    throw new Error(
      `PLATFORM_MISMATCH: configured=${config.platform} requested=${platform}`,
    );
  const profilePath = assertManagedProfile(
    managedProfile(dataRoot, config.browserConfig, config.accountId),
    path.join(dataRoot, "profiles"),
  );
  for (let round = 1; round <= rounds; round += 1) {
    const checkpoint = (name: string, data: Record<string, unknown>) => {
      process.stdout.write(
        JSON.stringify({ round, checkpoint: name, ...data }) + "\n",
      );
    };
    checkpoint("round:start", { status: "started" });
    checkpoint("profile:resolved", { profile: profilePath, status: "pass" });
    const session = new BrowserRegistry(
      dataRoot,
      discoverBrowsers({ customPath: config.browserConfig.executablePath }),
    ).create(config.browserConfig, config.accountId);
    checkpoint("profile:release-start", { status: "started" });
    await session.start();
    const login = await session.checkLoginState();
    await session.stop();
    checkpoint("profile:release-complete", {
      status: "pass",
      login: login.status,
    });
    if (login.status !== "logged_in")
      throw new Error(
        login.status === "unknown" ? "LOGIN_UNKNOWN" : "LOGIN_REQUIRED",
      );
    checkpoint("login:complete", { status: "pass", login: login.status });
    const result = await runCreatorCollectorTask({
      config,
      dataRoot,
      repositoryRoot: path.resolve(__dirname, "../../.."),
      profilePath,
      token,
      mode: requireExports ? "metrics_refresh" : "full_snapshot",
      checkpoint,
    });
    checkpoint("round:complete", {
      status: "pass",
      works: result.snapshot.works.length,
    });
  }
}
void main()
  .then(() => app.quit())
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
    app.quit();
  });
