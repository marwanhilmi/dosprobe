import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandModule } from 'yargs';
import { CONFIG_FILENAME, writeProjectConfig, which, resolveDosboxBinary, resolveDosboxOutput, DosboxConfig } from '@dosprobe/core';
import { resolvePaths, ensureDirs } from '../resolve-backend.ts';

export const setupCommand: CommandModule = {
  command: 'setup <backend>',
  describe: 'Set up emulator environment',
  builder: (yargs) =>
    yargs
      .positional('backend', {
        describe: 'Backend to set up',
        choices: ['qemu', 'dosbox'] as const,
        demandOption: true,
      })
      .option('force', {
        alias: 'f',
        describe: 'Recreate disk image and config from scratch',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    const backendType = argv['backend'] as string;
    const force = argv['force'] as boolean;
    const projectDir = (argv['project'] as string | undefined) ?? process.cwd();
    const paths = resolvePaths(projectDir, backendType);
    ensureDirs(paths);

    if (backendType === 'qemu') {
      await setupQemu(paths, projectDir, force);
    } else {
      await setupDosbox(paths, projectDir, force);
    }

    // Auto-create dosprobe.json if it doesn't exist
    const configPath = join(projectDir, CONFIG_FILENAME);
    if (!existsSync(configPath)) {
      writeProjectConfig(projectDir, { backend: backendType as 'qemu' | 'dosbox' });
      console.log(`\nCreated ${CONFIG_FILENAME} with backend: ${backendType}`);
    }
  },
};

async function setupQemu(paths: ReturnType<typeof resolvePaths>, _projectDir: string, force: boolean): Promise<void> {
  const FREEDOS_URL = 'https://www.ibiblio.org/pub/micro/pc-stuff/freedos/files/distributions/1.4/FD14-FullUSB.zip';

  // Check dependencies
  const missing: string[] = [];
  const qemu = which('qemu-system-i386');
  if (!qemu) missing.push('qemu');
  if (!which('mdel') || !which('mcopy')) missing.push('mtools');
  const mkisofs = which('mkisofs') ?? which('genisoimage');
  if (!mkisofs) missing.push('cdrtools');

  if (missing.length > 0) {
    console.error(`Missing dependencies: ${missing.join(', ')}`);
    console.error(`Install with: brew install ${missing.join(' ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Found QEMU: ${qemu}`);

  // Create shared directory structure
  mkdirSync(join(paths.sharedDir, 'game'), { recursive: true });
  mkdirSync(join(paths.sharedDir, 'tools'), { recursive: true });

  // Download and set up FreeDOS disk image
  if (force && existsSync(paths.diskImage)) {
    console.log('Removing existing disk image (--force)...');
    unlinkSync(paths.diskImage);
  }

  if (existsSync(paths.diskImage)) {
    console.log(`Disk image already exists: ${paths.diskImage}`);
  } else {
    const extractDir = join(tmpdir(), `dosprobe-freedos-${Date.now()}`);
    const zipPath = join(extractDir, 'freedos.zip');
    mkdirSync(extractDir, { recursive: true });

    try {
      console.log('Downloading FreeDOS 1.4 (FullUSB pre-installed image)...');
      execSync(`curl -L -o "${zipPath}" "${FREEDOS_URL}"`, { stdio: 'inherit' });

      console.log('Extracting FreeDOS...');
      execSync(`unzip -o "${zipPath}" -d "${extractDir}/extract"`, { stdio: 'inherit' });

      // Find the .img file inside the extracted archive
      const imgFile = execSync(`find "${extractDir}/extract" -iname "*.img" | head -n1`)
        .toString().trim();
      if (!imgFile) {
        console.error('No .img file found in FreeDOS archive');
        process.exitCode = 1;
        return;
      }

      // Patch startup files — remove the installer so FreeDOS boots to prompt
      // Partition 1 starts at sector 63 (63 * 512 = 32256)
      console.log('Patching startup files (removing installer)...');
      const offset = 32256;
      execSync(`mdel -i "${imgFile}"@@${offset} ::SETUP.BAT 2>/dev/null || true`);

      const tmpBat = join(extractDir, 'FDAUTO.BAT');
      execSync(`mcopy -i "${imgFile}"@@${offset} ::FDAUTO.BAT "${tmpBat}" 2>/dev/null`);
      // Remove the RunSetup block: from "if not exist SETUP.BAT" through ":Done"
      execSync(`sed '/^if not exist SETUP.BAT/,/^:Done/{ /^:Done/!d; }' "${tmpBat}" > "${tmpBat}.fixed"`);
      execSync(`mcopy -o -i "${imgFile}"@@${offset} "${tmpBat}.fixed" ::FDAUTO.BAT`);

      // Install CuteMouse — FreeDOS ships it as a package zip, not pre-installed
      console.log('Installing CuteMouse driver...');
      const ctmouseZip = join(extractDir, 'ctmouse.zip');
      execSync(`mcopy -i "${imgFile}"@@${offset} ::PACKAGES/BASE/CTMOUSE.ZIP "${ctmouseZip}"`);
      const ctmouseDir = join(extractDir, 'ctmouse');
      execSync(`unzip -o "${ctmouseZip}" BIN/CTMOUSE.EXE -d "${ctmouseDir}" 2>/dev/null`);
      execSync(`mcopy -o -i "${imgFile}"@@${offset} "${ctmouseDir}/BIN/CTMOUSE.EXE" ::FREEDOS/BIN/CTMOUSE.EXE`);

      // Append CTMOUSE + BLASTER env to FDAUTO.BAT so mouse works on every boot
      const fdautoPatch = join(extractDir, 'fdauto_append.txt');
      writeFileSync(fdautoPatch, 'SET BLASTER=A220 I5 D1 H5 T6\r\nCTMOUSE\r\n');
      execSync(`cat "${tmpBat}.fixed" "${fdautoPatch}" > "${tmpBat}.final"`);
      execSync(`mcopy -o -i "${imgFile}"@@${offset} "${tmpBat}.final" ::FDAUTO.BAT`);

      console.log('Converting to qcow2 (for snapshot support)...');
      execSync(`qemu-img convert -f raw -O qcow2 "${imgFile}" "${paths.diskImage}"`, { stdio: 'inherit' });

      console.log(`FreeDOS disk ready: ${paths.diskImage}`);
    } catch (err) {
      console.error('Failed to set up FreeDOS disk image:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return;
    } finally {
      rmSync(extractDir, { recursive: true, force: true });
    }
  }

  // Create shared data files
  const readmePath = join(paths.sharedDir, 'README.TXT');
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, [
      'DOS Test Harness - Shared Directory',
      '====================================',
      'Place your game files, tools, and extraction',
      'utilities here. This directory is burned to an',
      'ISO and mounted as D: in the VM.',
      '',
      'Rebuild the ISO after changes:',
      '  dosprobe rebuild-iso',
      '',
    ].join('\r\n'));
  }

  const setupBatPath = join(paths.sharedDir, 'SETUP.BAT');
  if (!existsSync(setupBatPath)) {
    writeFileSync(setupBatPath, [
      '@ECHO OFF',
      'ECHO.',
      'ECHO ========================================',
      'ECHO  DOS Test Harness Environment',
      'ECHO ========================================',
      'ECHO.',
      'ECHO  C: = FreeDOS system + game install',
      'ECHO  D: = Shared data (read-only ISO)',
      'ECHO.',
      'ECHO  To capture data, write to C:\\CAPTURE',
      'ECHO ========================================',
      'ECHO.',
      'SET BLASTER=A220 I5 D1 H5 T6',
      'IF NOT EXIST C:\\CAPTURE MD C:\\CAPTURE',
      'IF NOT EXIST C:\\GAME MD C:\\GAME',
      'PATH=%PATH%;D:\\TOOLS',
      '',
    ].join('\r\n'));
  }

  // Build shared ISO
  if (force && existsSync(paths.sharedIso)) {
    unlinkSync(paths.sharedIso);
  }

  if (!existsSync(paths.sharedIso)) {
    console.log('Building shared ISO...');
    try {
      execSync(
        `"${mkisofs}" -o "${paths.sharedIso}" -V "SHARED" -r -J "${paths.sharedDir}" 2>/dev/null`,
        { stdio: 'inherit' },
      );
    } catch {
      console.warn('Warning: Could not build shared ISO');
    }
  }

  console.log('\nQEMU environment ready.');
  console.log(`  VM directory:    ${paths.vmDir}`);
  console.log(`  Game ISOs:       ${paths.isosDir}`);
  console.log(`  Shared files:    ${paths.sharedDir}`);
  console.log(`  Captures:        ${paths.capturesDir}`);
  console.log(`  Golden files:    ${paths.goldenDir}`);
  console.log('\nTo mount a game CD-ROM:');
  console.log(`  Place .iso files in ${paths.isosDir}`);
  console.log('  They will be auto-mounted on next launch.');
}

async function setupDosbox(paths: ReturnType<typeof resolvePaths>, _projectDir: string, force: boolean): Promise<void> {
  // Check for DOSBox-X
  const dosboxBin = resolveDosboxBinary();
  if (!dosboxBin) {
    console.error('DOSBox-X binary not found.');
    console.error('Set DOSBOX_X_BIN=/path/to/dosbox-x, or install with:');
    console.error('  brew install dosbox-x');
    process.exitCode = 1;
    return;
  }
  console.log(`Found DOSBox-X: ${dosboxBin}`);

  const renderer = resolveDosboxOutput();
  console.log(`Using renderer: ${renderer}`);

  // Create drive_c structure
  mkdirSync(join(paths.driveCPath, 'GAME'), { recursive: true });

  // Write default config if none exists
  const defaultConf = join(paths.confDir, 'dosbox-x.conf');
  if (force || !existsSync(defaultConf)) {
    const conf = new DosboxConfig();
    conf.set('sdl', 'windowresolution', renderer === 'surface' ? 'original' : '640x480');
    conf.set('sdl', 'output', renderer);
    conf.set('dosbox', 'memsize', '32');
    conf.set('cpu', 'cycles', 'auto');
    conf.set('sblaster', 'sbtype', 'sb16');
    conf.set('sblaster', 'sbbase', '220');
    conf.set('sblaster', 'irq', '5');
    conf.set('sblaster', 'dma', '1');
    conf.set('sblaster', 'hdma', '5');
    conf.set('log', 'logfile', join(paths.capturesDir, 'dosbox-x.log'));
    conf.setAutoexec([
      `MOUNT C "${paths.driveCPath}"`,
      'C:',
      'SET BLASTER=A220 I5 D1 H5 T6',
    ]);
    conf.write(defaultConf);
    console.log(`Default config written: ${defaultConf}`);
  } else {
    console.log(`Config already exists: ${defaultConf}`);
  }

  console.log('\nDOSBox-X environment ready.');
  console.log(`  Drive C:         ${paths.driveCPath}`);
  console.log(`  Config:          ${paths.confDir}`);
  console.log(`  Captures:        ${paths.capturesDir}`);
  console.log(`  Save states:     ${paths.statesDir}`);
  console.log(`  Golden files:    ${paths.goldenDir}`);
  console.log(`  DOSBox binary:   ${dosboxBin}`);
  console.log(`  Renderer:        ${renderer}`);
}
