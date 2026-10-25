// `pnpm run dev:rooms`: the room server and the web app together, for trying rooms on this machine.
// The room server keeps its rooms in this process (REDIS_URL, if set, uses that Redis instead), the
// web app is started with NEXT_PUBLIC_ROOM_SERVER_URL pointing at it, and Ctrl+C stops both.
//
//   ROOM_PORT  the room server's port (default 8099)
//   PORT       the web app's port (default 3000)
import { spawn } from 'node:child_process';

const roomPort = process.env.ROOM_PORT ?? '8099';
const webPort = process.env.PORT ?? '3000';
const roomUrl = `http://localhost:${roomPort}`;
const children = [];
let stopping = false;

/** Runs `pnpm args…`, prefixing each line of its output with `name`. */
function run(name, args, env) {
  const child = spawn('pnpm', args, { env: { ...process.env, ...env }, stdio: ['inherit', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', chunk => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop();
      for (const line of lines) process.stdout.write(`[${name}] ${line}\n`);
    });
  }
  child.on('exit', code => {
    if (!stopping) { console.log(`[${name}] stopped (${code ?? 'signal'}); stopping the other one too`); stop(code ?? 1); }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// Locally rooms are made again and again (reloads, e2e runs): the hourly limit per address is lifted.
run('rooms', ['--filter', '@pplale/room-server', 'run', 'start'], { PORT: roomPort, ROOMS_PER_HOUR: process.env.ROOMS_PER_HOUR ?? '10000' });
// The web app starts once the room server answers, so the first page never finds it missing.
for (let attempt = 0; ; attempt++) {
  if (stopping) process.exit(1);
  try {
    if ((await fetch(`${roomUrl}/healthz`)).ok) break;
  } catch { /* Not listening yet. */ }
  if (attempt === 60) { console.error(`[rooms] did not answer at ${roomUrl}`); stop(1); }
  await new Promise(resolve => setTimeout(resolve, 500));
}
console.log(`[rooms] ready at ${roomUrl}`);
// `pnpm run dev` keeps its usual preparation (predev); Next.js takes its port from PORT.
run('web', ['run', 'dev'], { PORT: webPort, NEXT_PUBLIC_ROOM_SERVER_URL: roomUrl });
console.log(`[web] open http://localhost:${webPort}/game/ (a private window is another player)`);
