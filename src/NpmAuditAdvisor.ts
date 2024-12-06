import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';

import { Context } from 'probot';
import { simpleGit } from 'simple-git';

export default class NpmAuditAdvisor {
  constructor(private readonly context: Context<'push'>) {}

  async run() {
    // Clone repository based on data from context.
    const path = await this.cloneRepo();

    // Move into repo
    this.changeDir(path);

    // Update local repo
    await this.fetchGitUpdates();
    await this.checkoutRef();

    // Install dependencies
    await this.installDependencies();
    // Run `npm audit`
    await this.auditDependencies();
  }

  private async cloneRepo() {
    const installation_id = this.context.payload.installation?.id;

    if (!installation_id) {
      this.context.log.error('No installation.id on context.payload found');
      throw new Error('No installation.id on context.payload found');
    }
    const installationToken =
      await this.context.octokit.apps.createInstallationAccessToken({
        installation_id,
      });

    const accessToken = installationToken.data.token;
    const fullRepoName = this.context.payload.repository.full_name;
    const repoName = this.context.payload.repository.name;
    const path = `${process.cwd()}/repos/${repoName}`;

    if (!(await this.checkDirExists(path))) {
      const url = `https://x-access-token:${accessToken}@github.com/${fullRepoName}.git`;
      const output = await simpleGit().clone(url, path);
      this.context.log.info({ output });
    }

    return path;
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

  private async fetchGitUpdates() {
    this.context.log.info('Running `git fetch`');

    await this.runCmd('git fetch');
  }

  private async checkoutRef() {
    const ref = this.context.payload.ref;
    this.context.log.info({ ref }, 'Checking out ref');

    await this.runCmd(`git checkout ${ref}`);
  }

  private async installDependencies() {
    this.context.log.info('Installing dependencies');

    await this.runCmd('npm install');
  }

  private async auditDependencies() {
    this.context.log.info('Running `npm audit --omit=dev --json`');

    const { stdout, stderr } = await this.runCmd('npm audit --omit=dev --json');
    this.context.log.info(stdout);
    this.context.log.error(stderr);
  }

  private runCmd(cmd: string) {
    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        childProcess.exec(cmd, (err, stdout, stderr) => {
          if (err) {
            this.context.log.error({ err, stderr, stdout }, 'Process errored');
            reject(err);
          }

          resolve({ stdout, stderr });
        });
      },
    );
  }
}
