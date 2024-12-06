import { Context, ProbotOctokit } from 'probot';

export enum CheckStatus {
  SUCCESS = 'SUCCESS',
  UNAVAILABLE = 'UNAVAILABLE',
  FAILED = 'FAILED',
}

export class StatusChecksManager {
  constructor(
    private readonly context: Context<'pull_request'>,
    private readonly name: string,
  ) {}
  public async getCheck(): Promise<CheckStatus> {
    const response = await this.context.octokit.checks.listForRef(
      this.context.repo({
        ref: this.context.payload.pull_request.head.sha,
        check_name: this.name,
      }),
    );
    if (response.data.check_runs.length === 0) {
      return CheckStatus.UNAVAILABLE;
    }
    const check = response.data.check_runs[0];
    if (check.conclusion === 'success') {
      return CheckStatus.SUCCESS;
    }
    if (check.conclusion === 'failure') {
      return CheckStatus.FAILED;
    }
    const errorMessage = `Can't handle ${check.conclusion?.toString() ?? '""'} to determine check status`;
    this.context.log.error(errorMessage);
    return CheckStatus.UNAVAILABLE;
  }
  public setFailed(): ReturnType<ProbotOctokit['checks']['create']> {
    const checkOptions = {
      name: this.name,
      head_branch: '',
      head_sha: this.context.payload.pull_request.head.sha,
      status: 'completed' as const,
      conclusion: 'failure' as const,
      completed_at: new Date().toISOString(),
      request: {
        retries: 3,
        retryAfter: 3,
      },
      output: {
        title: 'Missing label',
        summary:
          'Please make sure to have a production or non-production label!',
      },
    };
    return this.context.octokit.checks.create(this.context.repo(checkOptions));
  }
  public async setSuccess(): Promise<
    ReturnType<ProbotOctokit['checks']['create']>
  > {
    const checkOptions = {
      name: this.name,
      head_branch: '',
      head_sha: this.context.payload.pull_request.head.sha,
      status: 'completed' as const,
      conclusion: 'success' as const,
      completed_at: new Date().toISOString(),
      request: {
        retries: 3,
        retryAfter: 3,
      },
      output: {
        title: 'All labels match',
        summary: 'Labels looking good, good job!',
      },
    };
    return await this.context.octokit.checks.create(
      this.context.repo(checkOptions),
    );
  }
}
