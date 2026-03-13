import { resolveBackend, getProjectConfig, defineCommand } from "../resolve-backend.ts"

export const keysCommand = defineCommand({
  command: "keys <keynames..>",
  describe: "Send keystrokes to the VM",
  builder: (yargs) =>
    yargs
      .positional("keynames", {
        describe: "Key names to send (e.g., right up enter)",
        type: "string",
        array: true,
      })
      .option("delay", {
        alias: "d",
        describe: "Delay between keys in ms (default: 150)",
        type: "number",
      }),
  handler: async (argv) => {
    const keys = argv.keynames!
    const config = getProjectConfig(argv)
    const delay = argv.delay ?? config.capture?.keyDelay ?? 150
    const { backend } = await resolveBackend(argv)

    try {
      await backend.sendKeys(keys, delay)
      console.log(`Sent ${keys.length} keys: ${keys.join(" ")}`)
    } finally {
      backend.disconnect()
    }
  },
})
