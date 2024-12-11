import Vault from 'node-vault';
import * as gcpMetadata from 'gcp-metadata';
import { IAMCredentialsClient } from '@google-cloud/iam-credentials';

export interface VaultConfig {
  endpoint: string;
  serviceAccountEmail?: string;
  role?: string;
  env: string;
}

export default class VaultClient {
  private readonly tokenExpirationSeconds = 300;
  private tokenExpirationEpochSeconds = 0;

  private vaultClient?: Vault.client;

  constructor(private readonly config: VaultConfig) {}

  async read<T>(path: string): Promise<T> {
    const parts = path.split('/');

    if (parts.length !== 2) {
      throw new Error(`path ${path} is invalid, it should be <mount>/<secret>`);
    }

    const [mount, secret] = parts;

    const client = await this.getClient();

    /* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment */
    const {
      data: { data },
    } = await client.read(`${mount}/data/${secret}`);
    return data;
    /* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment */
  }

  private async getClient(): Promise<Vault.client> {
    if (this.vaultClient && this.isTokenValid()) {
      return Promise.resolve(this.vaultClient);
    }

    const client = Vault({
      endpoint: this.config.endpoint,
    });

    let serviceAccount: string;
    if (!this.config.serviceAccountEmail) {
      serviceAccount = await gcpMetadata.instance(
        'service-accounts/default/email',
      );
    } else {
      serviceAccount = this.config.serviceAccountEmail;
    }

    const role = this.config.role ?? serviceAccount.split('@')[0];

    this.tokenExpirationEpochSeconds =
      this.getNowInSeconds() + this.tokenExpirationSeconds;
    const jwt = {
      sub: serviceAccount,
      aud: `vault/${role}`,
      exp: this.tokenExpirationEpochSeconds,
    };

    const iamClient = new IAMCredentialsClient();
    const [gcpResponse] = await iamClient.signJwt({
      name: `projects/-/serviceAccounts/${serviceAccount}`,
      delegates: [],
      payload: JSON.stringify(jwt),
    });

    if (!gcpResponse.signedJwt) {
      throw new Error('Failed to sign JWT for Vault');
    }

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    const vaultResponse = await client.gcpLogin({
      role,
      jwt: gcpResponse.signedJwt,
    });

    const token = vaultResponse?.auth?.client_token;
    if (typeof token !== 'string') {
      throw new Error('Failed to authenticate with Vault');
    }
    client.token = token;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    this.vaultClient = client;
    return client;
  }

  private isTokenValid(): boolean {
    // consider a token that will expire in 30 seconds as invalid
    return this.tokenExpirationEpochSeconds - 30 > this.getNowInSeconds();
  }

  private getNowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }
}
