import { assert } from '@deepkit/type';
import { Context, ProbotOctokit } from 'probot';

type ContextWithInstallation = Context & {
  payload?: {
    installation?: {
      id: number;
    };
  };
};

export async function createInstallationOctokit(
  context: ContextWithInstallation,
  installationToken?: string,
): Promise<ProbotOctokit> {
  const token = installationToken
    ? installationToken
    : await getInstallationToken(context);

  return new ProbotOctokit({
    auth: {
      token,
    },
  });
}

export async function getInstallationToken(
  context: ContextWithInstallation,
): Promise<string> {
  const installation_id = context.payload.installation?.id;

  if (!installation_id) {
    context.log.error('No installation.id on context.payload found');
    throw new Error('No installation.id on context.payload found');
  }

  const response = await context.octokit.apps.createInstallationAccessToken({
    installation_id,
  });

  assert<string>(response.data.token);

  return response.data.token;
}
