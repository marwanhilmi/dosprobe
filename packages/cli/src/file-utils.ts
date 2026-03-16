import { copyFileSync, cpSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"

function isCrossDeviceError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err && err.code === "EXDEV"
}

export function moveFile(sourcePath: string, destinationPath: string): void {
  mkdirSync(dirname(destinationPath), { recursive: true })

  try {
    renameSync(sourcePath, destinationPath)
  } catch (err) {
    if (!isCrossDeviceError(err)) {
      throw err
    }

    copyFileSync(sourcePath, destinationPath)
    unlinkSync(sourcePath)
  }
}

export function findFilesRecursive(
  dir: string,
  matches: (fullPath: string, fileName: string) => boolean,
): string[] {
  const results: string[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findFilesRecursive(fullPath, matches))
      } else if (matches(fullPath, entry.name)) {
        results.push(fullPath)
      }
    }
  } catch {
    // ignore permission errors etc.
  }

  return results
}

export function findFilesByExtension(dir: string, extension: string): string[] {
  const normalizedExtension = extension.toLowerCase()
  return findFilesRecursive(dir, (_fullPath, fileName) =>
    fileName.toLowerCase().endsWith(normalizedExtension),
  )
}

export function findAllFilesRecursive(dir: string): string[] {
  return findFilesRecursive(dir, () => true)
}

export function copyDirectoryContents(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true })

  const entries = readdirSync(sourceDir)
  for (const entry of entries) {
    cpSync(join(sourceDir, entry), join(destinationDir, entry), {
      force: true,
      recursive: true,
    })
  }
}
