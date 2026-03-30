import 'dotenv/config';
import { execSync } from 'child_process';

const port = process.env.NEXT_DEV_PORT || 3010;
console.log(`[NemarChat] Starting Next.js on port ${port}`);
execSync(`npx next dev --port ${port}`, { stdio: 'inherit' });
