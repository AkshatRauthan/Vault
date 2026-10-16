/**
 * One-time (and safely re-runnable) OpenBao setup for Vault.
 *
 *   pnpm openbao:bootstrap                     enable transit, platform key, policy, audit device
 *   pnpm openbao:bootstrap -- --issue-app-token   also mint the app's limited token (printed once)
 *
 * Needs an admin token (root, or one that can manage mounts, policies and tokens).
 * Reads OPENBAO_ADMIN_TOKEN, or prompts for it without echoing, so it never lands in shell history.
 * The admin token is used for this run only and is never stored.
 */

import '@vault/env';

import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { createOpenBaoHttp, IOpenBaoHttp, OpenBaoError } from '@vault/infra/openbao';

const ADDR = process.env.OPENBAO_ADDR ?? 'https://localhost:8200';
const CA_CERT_PATH = path.resolve(process.cwd(), process.env.OPENBAO_CA_CERT_PATH ?? '.docker/openbao/pki/ca.crt');
const USER_MOUNT = process.env.OPENBAO_USER_KEYS_MOUNT ?? 'user-keys';
const PLATFORM_MOUNT = process.env.OPENBAO_PLATFORM_KEYS_MOUNT ?? 'platform-keys';
const PLATFORM_KEY = process.env.OPENBAO_PLATFORM_KEY_NAME ?? 'platform-certification';
const POLICY_NAME = process.env.OPENBAO_APP_POLICY ?? 'vault-app';
const APP_TOKEN_PERIOD = '768h'; // 32 days; the app renews it, so it never lapses while the backend runs
const ISSUE_APP_TOKEN = process.argv.includes('--issue-app-token');

/**
 * Least privilege by exact paths, never by deny rules: OpenBao resolves overlapping rules by the
 * longest non-wildcard prefix, so a broad grant can silently beat a narrower deny. Per-user keys live
 * in their own mount; the platform key lives alone in another with an even smaller grant. Nothing
 * here covers config, trim, export, delete, list, or any other mount.
 */
const policyHcl = (): string => `# ${POLICY_NAME}: everything the Vault backend may do in OpenBao, and nothing else.

# Per-user signing keys: create one, read its public keys, rotate it, sign with it.
# Transit treats key creation as an update (it has no existence check), so "update" is required here.
# This is safe: POSTing to an existing key changes none of its settings (checked against OpenBao 2.7.1).
path "${USER_MOUNT}/keys/+" {
  capabilities = ["create", "update", "read"]
}
path "${USER_MOUNT}/keys/+/rotate" {
  capabilities = ["update"]
}
path "${USER_MOUNT}/sign/+" {
  capabilities = ["update"]
}

# Platform certification key: read its public key, sign certificates. Never rotate or reconfigure it.
path "${PLATFORM_MOUNT}/keys/${PLATFORM_KEY}" {
  capabilities = ["read"]
}
path "${PLATFORM_MOUNT}/sign/${PLATFORM_KEY}" {
  capabilities = ["update"]
}
`;

const promptSecret = (question: string): Promise<string> =>
    new Promise((resolve) => {
        process.stdout.write(question);
        const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
        const rl = readline.createInterface({ input: process.stdin, output: silent, terminal: true });
        rl.question('', (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer.trim());
        });
    });

const step = (message: string): void => console.log(`  - ${message}`);

const fail = (message: string): never => {
    console.error(`\nERROR: ${message}`);
    process.exit(1);
};

const run = async (): Promise<void> => {
    console.log(`OpenBao bootstrap against ${ADDR}\n`);

    const adminToken = process.env.OPENBAO_ADMIN_TOKEN ?? (await promptSecret('Admin token (input hidden): '));
    if (!adminToken) fail('No admin token provided.');

    const http: IOpenBaoHttp = createOpenBaoHttp({ addr: ADDR, caCertPath: CA_CERT_PATH, token: adminToken });

    // 1. Server state
    const health = await http.request('GET', 'sys/health?standbyok=true', undefined, {
        token: null,
        allowStatuses: [429, 472, 473, 501, 503],
    });
    if (health.status === 501) fail('OpenBao is not initialized. Run "bao operator init" first.');
    if (health.status === 503) fail('OpenBao is sealed. Unseal it first ("bao operator unseal").');
    step('server is initialized and unsealed');

    // 2. Admin token works
    await http.request('GET', 'auth/token/lookup-self');
    step('admin token accepted');

    // 3. Transit engines: one for user keys, one for the platform key
    const mounts = await http.request<{ data?: Record<string, unknown> }>('GET', 'sys/mounts');
    for (const mount of [USER_MOUNT, PLATFORM_MOUNT]) {
        if (mounts.body?.data && `${mount}/` in mounts.body.data) {
            step(`transit engine already mounted at ${mount}/`);
        } else {
            await http.request('POST', `sys/mounts/${mount}`, { type: 'transit' });
            step(`transit engine mounted at ${mount}/`);
        }
    }

    // 4. Platform certification key (signs key certificates; never signs documents)
    const existing = await http.request<{ data?: { type?: string; latest_version?: number } }>(
        'GET',
        `${PLATFORM_MOUNT}/keys/${PLATFORM_KEY}`,
        undefined,
        { allowStatuses: [404] },
    );
    if (existing.status === 404) {
        await http.request('POST', `${PLATFORM_MOUNT}/keys/${PLATFORM_KEY}`, {
            type: 'ed25519',
            exportable: false,
            allow_plaintext_backup: false,
            deletion_allowed: false,
        });
        step(`platform key "${PLATFORM_KEY}" created (ed25519, non-exportable, deletion disabled)`);
    } else if (existing.body?.data?.type !== 'ed25519') {
        fail(`"${PLATFORM_KEY}" exists but is not an ed25519 key.`);
    } else {
        step(`platform key "${PLATFORM_KEY}" already exists`);
    }

    const platform = await http.request<{
        data?: { latest_version?: number; keys?: Record<string, { public_key?: string }> };
    }>('GET', `${PLATFORM_MOUNT}/keys/${PLATFORM_KEY}`);
    const latest = platform.body?.data?.latest_version ?? 1;
    const publicKey = platform.body?.data?.keys?.[String(latest)]?.public_key;

    // 5. App policy (rewritten on every run so it always matches this file)
    await http.request('PUT', `sys/policies/acl/${POLICY_NAME}`, { policy: policyHcl() });
    step(`policy "${POLICY_NAME}" written`);

    // 6. Audit device. OpenBao refuses to create these through the API, so they are declared in
    //    openbao.hcl; here we only check that one is active and say what to add if not.
    const audits = await http.request<{ data?: Record<string, unknown> }>('GET', 'sys/audit');
    if (audits.body?.data && Object.keys(audits.body.data).length > 0) {
        step('audit device enabled (declared in openbao.hcl)');
    } else {
        console.warn(`
  ! No audit device is enabled, so nothing records certificate signing.
    Add this to openbao.hcl and restart (or send SIGHUP):

      audit "file" "to-stdout" {
        options {
          file_path = "stdout"
        }
      }
`);
    }

    // 7. App token
    if (ISSUE_APP_TOKEN) {
        const created = await http.request<{ auth?: { client_token?: string } }>('POST', 'auth/token/create', {
            policies: [POLICY_NAME],
            period: APP_TOKEN_PERIOD,
            renewable: true,
            no_parent: true, // survives revocation of the admin/root token
            display_name: 'vault-backend',
        });
        const appToken = created.body?.auth?.client_token;
        if (!appToken) fail('OpenBao did not return a token.');
        console.log('\nApp token (shown once; put it in .env as OPENBAO_TOKEN, which must be gitignored):\n');
        console.log(`  ${appToken}\n`);
    } else {
        step('skipped app token (pass --issue-app-token to mint one)');
    }

    console.log('\nPin this platform public key for verifiers (it must live outside MongoDB):');
    console.log(`  keyId:      ${PLATFORM_KEY}`);
    console.log(`  keyVersion: ${latest}`);
    console.log(`  publicKey:  ${publicKey}`);
    console.log('\nDone.');
};

run()
    .catch((error: unknown) => {
        const message = error instanceof OpenBaoError ? error.message : error instanceof Error ? error.message : String(error);
        fail(message);
    })
    .finally(() => process.exit(process.exitCode ?? 0));