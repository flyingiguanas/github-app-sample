import { Probot } from 'probot';
import { IGithubConfig } from './LabelMatcher.js';
import { CheckStatus, StatusChecksManager } from './StatusChecksManager.js';
import NpmAuditAdvisor from './NpmAuditAdvisor.js';
import { createInstallationOctokit, getInstallationToken } from './utils.js';

export default (app: Probot) => {
  app.on(
    [
      'installation.created',
      'installation_repositories.added',
      'installation.unsuspend',
      'installation.new_permissions_accepted',
      'pull_request.labeled',
    ],
    async (context) => {
      const installationOctokit = await createInstallationOctokit(context);

      context.log.info(`handling ${context.name} event`);

      const installationId = context.payload.installation?.id;
      if (!installationId) {
        context.log.warn('No installation.id found');
        throw new Error('No installation.id found');
      }

      const repos =
        await installationOctokit.apps.listReposAccessibleToInstallation({
          installation_id: installationId,
        });
      void repos.data.repositories.map(async (repo) => {
        const repoContext = { repo: repo.name, owner: repo.owner.login };

        const labels =
          await installationOctokit.issues.listLabelsForRepo(repoContext);
        const labelNames = labels.data.map((label) => label.name);

        const prodLabel = {
          name: 'production',
          color: '0e8a16',
          ...repoContext,
        };
        if (!labelNames.includes('production')) {
          await installationOctokit.issues.createLabel(prodLabel);
        } else {
          await installationOctokit.issues.updateLabel(prodLabel);
        }

        const nonProdLabel = {
          name: 'non-production',
          color: 'bfd4f2',
          ...repoContext,
        };
        if (!labelNames.includes('non-production')) {
          await installationOctokit.issues.createLabel(nonProdLabel);
        } else {
          await installationOctokit.issues.updateLabel(nonProdLabel);
        }
      });
    },
  );

  app.on(
    [
      'pull_request.opened',
      'pull_request.reopened',
      'pull_request.ready_for_review',
    ],
    async (context) => {
      const installationOctokit = await createInstallationOctokit(context);

      context.log.info(`handling ${context.name} event`);

      const labels = context.payload.pull_request.labels.map(
        (label) => label.name,
      );
      if (
        !labels.includes('production') &&
        !labels.includes('non-production')
      ) {
        const data: IGithubConfig | null =
          await context.config<IGithubConfig>('labels.yml');
        const defaultLabel = data?.default || 'production';
        await installationOctokit.issues.addLabels(
          context.issue({ labels: [defaultLabel] }),
        );
      }
    },
  );

  app.on('pull_request', async (context) => {
    context.log.info(`handling ${context.name} event`);

    const labels = context.payload.pull_request.labels.map(
      (label) => label.name,
    );

    const valid =
      labels.includes('production') || labels.includes('non-production');

    const targetStatus = valid ? CheckStatus.SUCCESS : CheckStatus.FAILED;

    const installationOctokit = await createInstallationOctokit(context);
    const statusChecksManager = new StatusChecksManager(
      context,
      'pager_soc2_labels',
      installationOctokit,
    );
    const status = await statusChecksManager.getCheck();
    if (targetStatus === status) {
      return;
    }
    switch (targetStatus) {
      case CheckStatus.FAILED:
        await statusChecksManager.setFailed();
        break;
      case CheckStatus.SUCCESS:
        await statusChecksManager.setSuccess();
        break;
    }
  });

  app.on('pull_request.synchronize', async (context) => {
    context.log.info(`handling ${context.name} event`);

    const installationToken = await getInstallationToken(context);
    const installationOctokit = await createInstallationOctokit(
      context,
      installationToken,
    );

    const advisor = new NpmAuditAdvisor(
      context,
      installationOctokit,
      installationToken,
    );
    void advisor.run();
  });
};
