import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';

import { Context, ProbotOctokit } from 'probot';
import { simpleGit } from 'simple-git';
import { assert, is } from '@deepkit/type';

import { CommandError } from './Errors.js';
import {
  AnalyzedVulnerabilities,
  Nsprc,
  Via,
  type Vulnerabilities,
} from './NpmAudit.types.js';

export default class NpmAuditAdvisor {
  constructor(
    private readonly context: Context<'pull_request.synchronize'>,
    private readonly installationOctokit: ProbotOctokit,
    private readonly installationToken: string,
  ) {}

  async run() {
    // Clone repository based on data from context.
    const path = await this.cloneRepo();

    // Move into repo
    this.changeDir(path);

    // Update local repo
    await this.fetchGitUpdates();
    await this.checkoutRef();
    await this.pullLatest();

    // Install dependencies
    await this.installDependencies();
    // Run `npm audit`
    const vulnerabilities = await this.auditDependencies();

    // TODO: Read in `.nsprc` file
    const exceptions = await this.readNsprc();

    if (vulnerabilities) {
      await this.comment(vulnerabilities, exceptions);
    }
  }

  private async cloneRepo() {
    const accessToken = this.installationToken;
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
    const ref = this.context.payload.pull_request.head.ref;
    this.context.log.info({ ref }, 'Checking out ref');

    try {
      await this.runCmd(`git checkout ${ref}`);
    } catch (err) {
      if (
        is<CommandError>(err) &&
        !err.stderr.includes(`Already on '${ref}'`)
      ) {
        this.context.log.error({ err }, 'Error while checking out ref');
      }
    }
  }

  private async pullLatest() {
    await this.runCmd('git pull');
  }

  private async installDependencies() {
    this.context.log.info('Installing dependencies');

    await this.runCmd('npm install');
  }

  private async auditDependencies() {
    this.context.log.info('Running `npm audit --omit=dev --json`');

    try {
      const { stdout, stderr } = await this.runCmd(
        'npm audit --omit=dev --json',
      );
      // TODO: Handle case where repo doesn't have vulnerabilities
      this.context.log.info(stdout);
      this.context.log.error(stderr);
      return null;
    } catch (err) {
      if (is<CommandError>(err)) {
        this.context.log.info({ err }, 'CommandError');

        // TODO: handle case where repo does have vulnerabilities
        if (typeof err.stdout === 'string') {
          const output = JSON.parse(err.stdout) as unknown;
          assert<Vulnerabilities>(output);
          return this.analyzeVulnerabilities(output);
        }
      }

      return null;
    }
  }

  private runCmd(cmd: string) {
    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        childProcess.exec(cmd, (error, stdout, stderr) => {
          if (error) {
            const err = CommandError.fromExecException(error, {
              stdout,
              stderr,
            });
            reject(err);
          }

          resolve({ stdout, stderr });
        });
      },
    );
  }

  private analyzeVulnerabilities(output: Vulnerabilities) {
    this.context.log.info({ output }, 'Vulnerabilities');

    const rootNodes = []; // have no `via` entries -- these are the packages with vulnerabilities
    const leafNodes = []; // have no `effects` entries -- these are our direct dependencies
    const urls = new Set<string>(); // set of URLs for comparing against .nsprc

    for (const id in output.vulnerabilities) {
      const vuln = output.vulnerabilities[id];

      for (const cause of vuln.via) {
        if (is<Via>(cause)) {
          urls.add(cause.url);
        }
      }

      if (vuln.fixAvailable) {
        if (vuln.effects.length === 0) {
          leafNodes.push(vuln);
        } else {
          rootNodes.push(vuln);
        }
      }
    }

    this.context.log.info(
      { rootNodes, leafNodes, urls: Array.from(urls) },
      'Nodes',
    );

    return {
      rootNodes,
      leafNodes,
      urls,
    };
  }

  private async comment(
    vulnerabilities: AnalyzedVulnerabilities,
    exceptions: string[],
  ) {
    const commentHeadline = `<!-- ${NpmAuditAdvisor.name} -->`;

    const resolvableAdvisories = vulnerabilities.leafNodes
      .concat(vulnerabilities.rootNodes)
      .map((node) => `- ${node.name}`);
    const exceptionsDiff = exceptions
      .filter((exc) => !vulnerabilities.urls.has(exc))
      .map((exc) => `- ${exc}`);

    const body = `${commentHeadline}
UPDATED AT: ${new Date().toISOString()}

${resolvableAdvisories.length ? `# Potentially Resolvable Advisories\n${resolvableAdvisories.join('\n')}` : ''}

${exceptionsDiff.length ? `# Exceptions that might not need to be in the \`.nsprc\` file\n${exceptionsDiff.join('\n')}` : ''}
`;

    const owner = this.context.payload.repository.owner.login;
    const repo = this.context.payload.repository.name;
    const issue_number = this.context.payload.pull_request.number;

    const existingComments = await this.installationOctokit.issues.listComments(
      {
        owner,
        repo,
        issue_number,
      },
    );
    this.context.log.info(
      { existingComments, issue_number, owner, repo },
      'Existing comments',
    );

    const matchingComment = existingComments.data.find((comment) =>
      comment.body?.startsWith(commentHeadline),
    );
    if (matchingComment) {
      await this.installationOctokit.issues.updateComment({
        owner,
        repo,
        comment_id: matchingComment.id,
        body,
      });

      return;
    } else {
      await this.installationOctokit.issues.createComment({
        owner,
        repo,
        body,
        issue_number,
      });
    }
  }

  private async readNsprc() {
    const nsprcFile = await fs.readFile('./.nsprc', { encoding: 'utf8' });
    const nsprc = JSON.parse(nsprcFile) as unknown;
    assert<Nsprc>(nsprc);

    return nsprc.exceptions;
  }
}
