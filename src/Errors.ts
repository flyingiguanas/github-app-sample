import childProcess from 'node:child_process';

export class CommandError extends Error implements childProcess.ExecException {
  constructor(
    public name: string,
    public message: string,
    public stdout: string,
    public stderr: string,
    public code?: number,
    options?: { cause: Error },
  ) {
    super(message, options);
  }

  static fromExecException(
    exception: childProcess.ExecException,
    { stdout, stderr }: { stdout: string; stderr: string },
  ) {
    return new CommandError(
      exception.name,
      exception.message,
      stdout,
      stderr,
      exception.code,
    );
  }
}
