import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { tmpdir } from "node:os"
import {
  copyDirectoryContents,
  findAllFilesRecursive,
  findFilesByExtension,
  moveFile,
} from "../file-utils.ts"
import { resolveBackendType, resolvePaths, ensureDirs, defineCommand } from "../resolve-backend.ts"

export const fetchCommand = defineCommand({
  command: "fetch <url>",
  describe: "Download a game archive (ZIP) and extract ISOs into the isos/ directory",
  builder: (yargs) =>
    yargs
      .positional("url", {
        describe: "URL of the game archive to download",
        type: "string",
        demandOption: true,
      })
      .option("output", {
        alias: "o",
        describe: "Output directory for ISOs (defaults to data/<backend>/isos/)",
        type: "string",
      })
      .option("extract", {
        describe: "Auto-extract ZIP archives",
        type: "boolean",
        default: true,
      }),
  handler: async (argv) => {
    const url = argv.url!
    const type = resolveBackendType(argv)
    const projectDir = argv.project
    const paths = resolvePaths(projectDir, type)
    ensureDirs(paths)

    const outputDir = argv.output ?? paths.isosDir
    mkdirSync(outputDir, { recursive: true })

    const urlFilename = basename(new URL(url).pathname)
    const ext = extname(urlFilename).toLowerCase()

    const tmpDir = join(tmpdir(), `dosprobe-fetch-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    const downloadPath = join(tmpDir, urlFilename)

    try {
      // Download the file
      console.log(`Downloading ${url}...`)
      console.log(`  Destination: ${downloadPath}`)
      execFileSync("curl", ["-L", "-o", downloadPath, url], {
        stdio: "inherit",
        timeout: 600_000, // 10 minute timeout for large files
      })

      if (!existsSync(downloadPath)) {
        console.error("Download failed: file not found after download")
        process.exitCode = 1
        return
      }

      const fileSize = statSync(downloadPath).size
      console.log(`Downloaded ${(fileSize / (1024 * 1024)).toFixed(1)} MB`)

      if (ext === ".zip" && argv.extract) {
        // Extract the ZIP and look for ISOs
        const extractDir = join(tmpDir, "extracted")
        mkdirSync(extractDir, { recursive: true })

        console.log("Extracting ZIP archive...")
        execFileSync("unzip", ["-o", downloadPath, "-d", extractDir], {
          stdio: "inherit",
        })

        // Find ISO files recursively
        const isoFiles = findFilesByExtension(extractDir, ".iso")

        if (isoFiles.length === 0) {
          // No ISOs found — check for other game files
          const allFiles = findAllFilesRecursive(extractDir)
          console.log(`No ISO files found in archive. Found ${allFiles.length} files:`)
          for (const f of allFiles.slice(0, 20)) {
            const rel = f.slice(extractDir.length + 1)
            console.log(`  ${rel}`)
          }
          if (allFiles.length > 20) {
            console.log(`  ... and ${allFiles.length - 20} more`)
          }

          // Copy the entire extracted contents to the isos directory for manual handling
          console.log(`\nCopying extracted files to ${outputDir}`)
          copyDirectoryContents(extractDir, outputDir)
        } else {
          console.log(`Found ${isoFiles.length} ISO file(s):`)
          for (const isoPath of isoFiles) {
            const isoName = basename(isoPath)
            const destPath = join(outputDir, isoName)
            console.log(`  ${isoName} → ${destPath}`)
            moveFile(isoPath, destPath)
          }
        }
      } else if (ext === ".iso") {
        // Direct ISO file — move to output
        const destPath = join(outputDir, urlFilename)
        console.log(`Moving ISO to ${destPath}`)
        moveFile(downloadPath, destPath)
      } else {
        // Unknown format — just move to output directory
        const destPath = join(outputDir, urlFilename)
        console.log(`Moving file to ${destPath}`)
        moveFile(downloadPath, destPath)
      }

      console.log("\nDone! ISOs are ready in:", outputDir)

      // List what's in the isos directory
      try {
        const files = readdirSync(outputDir)
        if (files.length > 0) {
          console.log("\nFiles in isos directory:")
          for (const f of files) {
            const fPath = join(outputDir, f)
            const size = statSync(fPath).size
            console.log(`  ${f} (${(size / (1024 * 1024)).toFixed(1)} MB)`)
          }
        }
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("Fetch failed:", err instanceof Error ? err.message : err)
      process.exitCode = 1
    } finally {
      // Clean up temp directory
      rmSync(tmpDir, { recursive: true, force: true })
    }
  },
})
