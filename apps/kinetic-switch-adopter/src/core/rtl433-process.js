import { spawn } from "node:child_process";
import readline from "node:readline";

export async function runRtl433({
  binaryPath = "rtl_433",
  args = [],
  timeoutMs = 120_000,
  onStdoutLine,
  onStderrLine
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdoutLines = [];
    const stderrLines = [];
    let settled = false;

    const finalize = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const stdoutReader = readline.createInterface({ input: child.stdout });
    const stderrReader = readline.createInterface({ input: child.stderr });

    stdoutReader.on("line", (line) => {
      stdoutLines.push(line);
      if (onStdoutLine) {
        onStdoutLine(line);
      }
    });

    stderrReader.on("line", (line) => {
      stderrLines.push(line);
      if (onStderrLine) {
        onStderrLine(line);
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGINT");
      }
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
      fail(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeoutHandle);
      finalize({
        code,
        signal,
        stdoutLines,
        stderrLines
      });
    });
  });
}
