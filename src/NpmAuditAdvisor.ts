import fs from 'node:fs/promises';
import process from 'node:process';

import { Context } from 'probot';
import { simpleGit } from 'simple-git';

export default class NpmAuditAdvisor {
  constructor(private readonly context: Context<'push'>) {}

  async run() {
    // Clone repository based on data from context.
    await this.cloneRepo();

    // Move into repo
    const cwd = process.cwd();
    const repoName = this.context.payload.repository.name;
    // TODO: Did I forget about error handling?
    this.changeDir(`${cwd}/${repoName}`);

    // Update local repo
    this.fetchGitUpdates();
    this.checkoutRef();

    // Install dependencies
    this.installDependencies();
    // Run `npm audit`
    this.auditDependencies();
  }

  private async cloneRepo() {
    const installation_id = this.context.payload.installation?.id;

    if (!installation_id) {
      this.context.log.info('No installation.id on context.payload found');
      return;
    }
    const installationToken =
      await this.context.octokit.apps.createInstallationAccessToken({
        installation_id,
      });

    const accessToken = installationToken.data.token;
    const fullRepoName = this.context.payload.repository.full_name;
    const repoName = this.context.payload.repository.name;

    if (!(await this.checkDirExists(`${process.cwd()}/${repoName}`))) {
      const url = `https://x-access-token:${accessToken}@github.com/${fullRepoName}.git`;
      const output = await simpleGit().clone(url);
      this.context.log.info({ output });
    }
  }

  private changeDir(dir: string) {
    try {
      process.chdir(dir);
      this.context.log.info({ dir: process.cwd() }, 'Changed to new directory');
    } catch (err) {
      this.context.log.warn({ err }, 'Error while changing directories');
      throw new Error('Failed to change directories', { cause: err });
    }
  }

  private async checkDirExists(dir: string): Promise<boolean> {
    try {
      await fs.access(dir);
    } catch (err) {
      this.context.log.info({ err, dir }, 'Directory does not already exist');
      return false;
    }

    return true;
  }

  private fetchGitUpdates() {
    this.context.log.info('Running `git fetch`');
    // TODO:
  }

  private checkoutRef() {
    const ref = this.context.payload.ref;
    this.context.log.info({ ref }, 'Checking out ref');
    // TODO:
  }

  private installDependencies() {
    this.context.log.info('Installing dependencies');
    // TODO:
  }

  private auditDependencies() {
    this.context.log.info('Running `npm audit --omit=dev --json`');
    // TODO:
  }
}
