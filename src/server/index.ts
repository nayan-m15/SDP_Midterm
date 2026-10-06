import { createApp } from './app';
import { config } from './config';
import { RepositoryStore } from './state/repositoryStore';

const store = new RepositoryStore();
const server = createApp(store).listen(config.port, () => {
  console.log(`RAT API listening on http://localhost:${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await store.clear();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
