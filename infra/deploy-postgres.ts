import { alchemy } from 'alchemy';
import { PostgresDatabase } from './src/resources/postgres/database';

async function main() {
  const app = await alchemy('origan-infrastructure');
  
  // Deploy PostgreSQL for Origan
  const db = await PostgresDatabase('origan-db', {
    namespace: 'origan',
    database: 'origan',
    user: 'origan_root',
    password: alchemy.secret(process.env.POSTGRES_PASSWORD!),
    storageSize: '10Gi',
    version: '16'
  });
  
  console.log('PostgreSQL Database deployed:');
  console.log('- Endpoint:', db.endpoint);
  console.log('- Connection String:', db.connectionString);
  console.log('- Namespace:', db.namespace);
  
  await app.finalize();
}

main().catch(console.error);