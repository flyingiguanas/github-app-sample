import { ProbotOctokit, run } from 'probot';
import { createCallbackAuth } from '@octokit/auth-callback';
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

  await run(app, {
    Octokit: ProbotOctokit.defaults({
      auth: {
        callback,
      },
      authStrategy: createCallbackAuth,
    }),
  });
}
void bootstrap();
