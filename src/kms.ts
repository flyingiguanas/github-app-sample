import crypto from 'crypto';

import { assert } from '@deepkit/type';
import base64url from 'base64url';
import { KeyManagementServiceClient } from '@google-cloud/kms';

const HEADER = {
  alg: 'RS256',
  typ: 'JWT',
};

export function createTokenSigner(
  kmsClient: KeyManagementServiceClient,
  keyName: string | undefined,
  clientId: string | undefined,
): () => Promise<string> {
  assert<string>(keyName);
  assert<string>(clientId);

  const b64Header = base64url.default(JSON.stringify(HEADER));

  return async () => {
    const now = Math.floor(new Date().getTime() / 1000); // current time in seconds

    const payload = {
      iat: now - 60, // account for clock drift
      exp: now + 10 * 60, // 10 minutes for expiration time
      iss: clientId,
    };
    const b64Payload = base64url.default(JSON.stringify(payload));

    const body = `${b64Header}.${b64Payload}`;

    const digest = crypto.createHash('sha256').update(body).digest('base64');

    const [response] = await kmsClient.asymmetricSign({
      digest: {
        sha256: digest,
      },
      name: keyName,
    });

    assert<string>(response.signature);

    return body + '.' + base64url.default(response.signature);
  };
}
