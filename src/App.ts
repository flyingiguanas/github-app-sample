import {Probot} from "probot";
import {IGithubConfig} from "./labelMatcher";
import {CheckStatus, StatusChecksManager} from "./statusChecksManager";

export default (app: Probot) => {
    app.on(['installation.created', 'installation_repositories.added', 'installation.unsuspend', 'installation.new_permissions_accepted'], async (context) => {
        context.log.info(`handling ${context.name} event`);

        const repos = await context.octokit.apps.listReposAccessibleToInstallation({ installation_id: context.payload.installation.id });
        repos.data.repositories.forEach(async (repo) => {
            const repoContext = { repo: repo.name, owner: repo.owner.login };

            const labels = await context.octokit.issues.listLabelsForRepo(repoContext);
            const labelNames = labels.data.map(label => label.name);

            const prodLabel = {name: 'production', color: '0e8a16', ...repoContext };
            if (!labelNames.includes('production')) {
                await context.octokit.issues.createLabel(prodLabel);
            } else {
                await context.octokit.issues.updateLabel(prodLabel);
            }

            const nonProdLabel = {name: 'non-production', color: 'bfd4f2', ...repoContext };
            if (!labelNames.includes('non-production')) {
                await context.octokit.issues.createLabel(nonProdLabel);
            } else {
                await context.octokit.issues.updateLabel(nonProdLabel);
            }
        });
    });

    app.on(['pull_request.opened', 'pull_request.reopened', 'pull_request.ready_for_review'], async (context) => {
        context.log.info(`handling ${context.name} event`);

        const labels = context.payload.pull_request.labels.map(label => label.name);
        if (!labels.includes('production') && !labels.includes('non-production')) {
            const data: IGithubConfig | null = await context.config<IGithubConfig>('labels.yml');
            const defaultLabel = data?.default || 'production';
            await context.octokit.issues.addLabels(context.issue({labels: [defaultLabel]}));
        }
    });

    app.on('pull_request', async (context) => {
        context.log.info(`handling ${context.name} event`);

        const labels = context.payload.pull_request.labels.map(label => label.name);

        const valid = labels.includes('production') || labels.includes('non-production');

        const targetStatus = valid ? CheckStatus.SUCCESS : CheckStatus.FAILED;

        const statusChecksManager = new StatusChecksManager(context, 'pager_soc2_labels');
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
}