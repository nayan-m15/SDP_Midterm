import { spawn } from 'node:child_process';
import { config } from '../config';
import { AppError } from '../errors';

export async function runGit(cwd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const fail = (error: AppError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(error);
    };

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > config.gitMaxOutputBytes) {
        fail(new AppError(422, 'GIT_OUTPUT_TOO_LARGE', 'Repository history is too large to analyze safely.'));
        return;
      }
      target.push(chunk);
    };

    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => {
      fail(new AppError(422, 'GIT_EXECUTION_FAILED', 'Git could not process this repository.', error));
    });

    const timer = setTimeout(() => {
      fail(new AppError(422, 'GIT_TIMEOUT', 'Git analysis exceeded the configured time limit.'));
    }, config.gitTimeoutMs);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new AppError(
            422,
            'GIT_COMMAND_FAILED',
            'Git could not process the repository or reference.',
            Buffer.concat(stderr).toString('utf8'),
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

export async function runGitText(cwd: string, args: string[]): Promise<string> {
  return (await runGit(cwd, args)).toString('utf8');
}
