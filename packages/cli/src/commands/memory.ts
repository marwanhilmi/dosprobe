import { writeFileSync } from "node:fs"
import type { CommandModule } from "yargs"
import { parseAddress } from "@dosprobe/core"
import { hexDump, fromHex } from "@dosprobe/shared"
import { resolveBackend } from "../resolve-backend.ts"
import type { GlobalArgs } from "../resolve-backend.ts"

export const memoryCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: "memory <action>",
  describe: "Read or write guest memory",
  builder: (yargs) =>
    yargs
      .command(
        "read <address> <size>",
        "Read memory from guest",
        (y) =>
          y
            .positional("address", {
              describe: "Address (hex linear or seg:off)",
              type: "string",
              demandOption: true,
            })
            .positional("size", {
              describe: "Size in bytes",
              type: "number",
              demandOption: true,
            })
            .option("output", {
              alias: "o",
              describe: "Output file path (omit for hex dump to stdout)",
              type: "string",
            }),
        async (argv) => {
          const { backend } = await resolveBackend(argv)

          try {
            const address = parseAddress(argv.address)
            const size = argv.size
            const data = await backend.readMemory(address, size)

            if (argv.output) {
              writeFileSync(argv.output, data)
              console.log(`Wrote ${data.length} bytes to ${argv.output}`)
            } else {
              if (argv.json) {
                console.log(
                  JSON.stringify({
                    address: `0x${address.linear.toString(16)}`,
                    size: data.length,
                    data: data.toString("base64"),
                  }),
                )
              } else {
                console.log(hexDump(data))
              }
            }
          } finally {
            backend.disconnect()
          }
        },
      )
      .command(
        "write <address> <hexdata>",
        "Write memory to guest",
        (y) =>
          y
            .positional("address", {
              describe: "Address (hex linear or seg:off)",
              type: "string",
              demandOption: true,
            })
            .positional("hexdata", {
              describe: "Hex-encoded data to write",
              type: "string",
              demandOption: true,
            }),
        async (argv) => {
          const { backend } = await resolveBackend(argv)

          try {
            const address = parseAddress(argv.address)
            const data = fromHex(argv.hexdata)
            await backend.writeMemory(address, data)
            console.log(`Wrote ${data.length} bytes to 0x${address.linear.toString(16)}`)
          } finally {
            backend.disconnect()
          }
        },
      )
      .demandCommand(1),
  handler: () => {},
}
