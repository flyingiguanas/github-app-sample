import { Probot, Server } from 'probot';
import dotenv from 'dotenv';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { assert } from '@deepkit/type';

import app, { AppConfig } from './App.js';
import { createJwt } from './kms.js';
import VaultClient, { VaultConfig } from './vaultClient.js';

dotenv.config();

async function bootstrap() {
  const vaultConfig = {
    endpoint: process.env.VAULT_ENDPOINT,
    serviceAccountEmail: process.env.VAULT_SERVICE_ACCOUNT_EMAIL,
    role: process.env.VAULT_ROLE,
    env: process.env.VAULT_ENV,
  };
  assert<VaultConfig>(vaultConfig);
  const vaultClient = new VaultClient(vaultConfig);

  const vaultConfigEnv = vaultConfig.env || 'undefined';

  const appConfig = vaultClient.read(`${vaultConfigEnv}/github-app`);
  assert<AppConfig>(appConfig);

  const appToken = await createJwt(
    new KeyManagementServiceClient(),
    process.env.GOOGLE_KMS_KEY_NAME,
    process.env.GITHUB_APP_CLIENT_ID,
  );

  const server = new Server({
    webhookProxy: process.env.WEBHOOK_PROXY_URL,
    Probot: Probot.defaults({
      githubToken: appToken,
      appId: process.env.APP_ID,
      secret: appConfig.webhookSecret ?? process.env.WEBHOOK_SECRET,
    }),
  });

  await server.load(app);

  await server.start();
}
void bootstrap();
