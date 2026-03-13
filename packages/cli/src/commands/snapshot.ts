import type { CommandModule } from "yargs"
import { resolveBackend } from "../resolve-backend.ts"
import type { GlobalArgs } from "../resolve-backend.ts"

export const snapshotCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: "snapshot <action>",
  describe: "Manage VM snapshots",
  builder: (yargs) =>
    yargs
      .command(
        "save <name>",
        "Save a snapshot",
        (y) =>
          y.positional("name", {
            describe: "Snapshot name",
            type: "string",
            demandOption: true,
          }),
        async (argv) => {
          const name = argv.name
          const { backend } = await resolveBackend(argv)

          try {
            const snap = await backend.saveSnapshot(name)
            console.log(`Snapshot saved: ${snap.name}`)
          } finally {
            backend.disconnect()
          }
        },
      )
      .command(
        "load <name>",
        "Load a snapshot",
        (y) =>
          y.positional("name", {
            describe: "Snapshot name",
            type: "string",
            demandOption: true,
          }),
        async (argv) => {
          const name = argv.name
          const { backend } = await resolveBackend(argv)

          try {
            await backend.loadSnapshot(name)
            console.log(`Snapshot loaded: ${name}`)
          } finally {
            backend.disconnect()
          }
        },
      )
      .command(
        "list",
        "List snapshots",
        (y) => y,
        async (argv) => {
          const { backend } = await resolveBackend(argv)

          try {
            const snapshots = await backend.listSnapshots()
            if (argv.json) {
              console.log(JSON.stringify(snapshots, null, 2))
            } else if (snapshots.length === 0) {
              console.log("No snapshots found.")
            } else {
              for (const snap of snapshots) {
                const size = snap.size ? ` (${(snap.size / 1024 / 1024).toFixed(1)} MB)` : ""
                const modified = snap.modified ? `  ${snap.modified.toISOString()}` : ""
                console.log(`  ${snap.name}${size}${modified}`)
              }
            }
          } finally {
            backend.disconnect()
          }
        },
      )
      .demandCommand(1),
  handler: () => {},
}
