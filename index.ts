import { definePlugin, type PluginRuntimeContext } from "@typegaro/atom-plugin";
import { OpenTuiChatRuntime } from "./runtime";

export default definePlugin({
  id: "atom-opentui",
  capabilities: ["models", "runs", "sessions"],
  cliCommands: [{
    register(program, host) {
      program
        .command("opentui")
        .description("Launch the OpenTUI chat channel")
        .action(async () => {
          await runOpenTuiChannel(host);
        });
    }
  }],
  channels: [{
    id: "atom-opentui",
    start(host) {
      return runOpenTuiChannel(host);
    }
  }]
});

async function runOpenTuiChannel(context: PluginRuntimeContext<"models" | "sessions">): Promise<void> {
  const session = context.runtime.openSession({ key: "atom-opentui", storeSession: true });
  const _runtime = await OpenTuiChatRuntime.create(session);
  await new Promise<void>(() => {});
}
