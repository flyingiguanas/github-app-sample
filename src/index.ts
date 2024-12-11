import { Probot, Server } from 'probot';
import dotenv from 'dotenv';
import { KeyManagementServiceClient } from '@google-cloud/kms';

import app from './App.js';
import { createTokenSigner } from './kms.js';

dotenv.config();

async function bootstrap() {
  const callback = createTokenSigner(
    new KeyManagementServiceClient(),
    process.env.GOOGLE_KMS_KEY_NAME,
    process.env.GITHUB_APP_CLIENT_ID,
  );

  const appToken = await callback();

  const server = new Server({
    webhookProxy: process.env.WEBHOOK_PROXY_URL,
    Probot: Probot.defaults({
      githubToken: appToken,
      appId: process.env.APP_ID,
      secret: process.env.WEBHOOK_SECRET,
    }),
  });

  await server.load(app);

  await server.start();
}
void bootstrap();
