import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IPdfPreflightRejection, IPreflightLimits } from './pdf.types';

/**
 * Structural validation with `qpdf --check`, run on the ORIGINAL uploaded bytes. Its output is never
 * used for anything else: Vault never signs a repaired or rewritten file.
 *
 * qpdf exit codes: 0 = no errors or warnings, 2 = errors, 3 = warnings only. Strict policy: anything
 * but 0 rejects the document (a warning usually means qpdf had to repair the file).
 *
 * qpdf cannot read stdin, so the bytes go to a private temp directory (0700) that is always removed.
 * In containers, mount /tmp as tmpfs so uploads never touch a disk.
 */

/** The check could not run at all (missing binary, crash). Not a verdict on the document: fail closed. */
export class PreflightUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PreflightUnavailableError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

const MAX_OUTPUT_BYTES = 64 * 1024;

interface IExecResult {
    code: number | null;
    output: string;
    timedOut: boolean;
    truncated: boolean;
}

const exec = (command: string, args: string[], cwd: string, timeoutMs: number): Promise<IExecResult> =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env: { PATH: process.env.PATH ?? '' }, stdio: ['ignore', 'pipe', 'pipe'] });

        let output = '';
        let truncated = false;
        let timedOut = false;

        const collect = (chunk: Buffer): void => {
            if (output.length + chunk.length > MAX_OUTPUT_BYTES) {
                truncated = true;
                child.kill('SIGKILL');
                return;
            }
            output += chunk.toString('utf8');
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.on('error', (error: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            reject(new PreflightUnavailableError(`qpdf could not be started (${error.code ?? error.message})`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, output, timedOut, truncated });
        });
    });

const versionCache = new Map<string, string>();

/** The qpdf version in use (goes into the manifest). Cached per executable path. */
export const getQpdfVersion = async (qpdfPath: string): Promise<string> => {
    const cached = versionCache.get(qpdfPath);
    if (cached) return cached;

    const result = await exec(qpdfPath, ['--version'], tmpdir(), 5000);
    const match = /qpdf version (\d+(?:\.\d+)*)/.exec(result.output);
    if (result.code !== 0 || !match?.[1]) {
        throw new PreflightUnavailableError('Could not determine the qpdf version');
    }
    versionCache.set(qpdfPath, match[1]);
    return match[1];
};

/** First meaningful line of qpdf's output, with the temp path stripped. */
const summarize = (output: string, dir: string): string => {
    const line = output
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /^(WARNING|ERROR)/i.test(l) || /invalid password/i.test(l));
    return (line ?? 'qpdf reported a problem').split(dir).join('upload').slice(0, 200);
};

/** Resolves to null when the file passes, or to a rejection. Throws PreflightUnavailableError if qpdf can't run. */
export const runQpdfCheck = async (pdf: Buffer, limits: IPreflightLimits): Promise<IPdfPreflightRejection | null> => {
    const dir = await mkdtemp(join(tmpdir(), 'vault-preflight-'));
    try {
        await writeFile(join(dir, 'input.pdf'), pdf, { mode: 0o600 });
        const result = await exec(limits.qpdfPath, ['--check', 'input.pdf'], dir, limits.workerTimeoutMs);

        if (result.timedOut) {
            return { preflightPassed: false, reason: 'limits-exceeded', detail: 'qpdf check timed out' };
        }
        if (result.truncated) {
            return { preflightPassed: false, reason: 'limits-exceeded', detail: 'qpdf produced excessive output' };
        }
        if (result.code === 0) return null;

        if (result.code === 2 || result.code === 3) {
            // A password-protected file can't be checked without its password: that is "encrypted", not "damaged".
            const reason = /invalid password/i.test(result.output) ? 'encrypted' : 'malformed-or-unrecoverable';
            return { preflightPassed: false, reason, detail: summarize(result.output, dir) };
        }
        // Killed by a signal, or an exit code qpdf doesn't document: we don't know, so we don't accept.
        throw new PreflightUnavailableError(`qpdf exited unexpectedly (code ${String(result.code)})`);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
};