// Environment Initialization and PATH setup
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure server/bin is in PATH for native binaries (e.g. zstd.exe on Windows)
const binDir = path.resolve(__dirname, '../bin');
if (!process.env.PATH?.includes(binDir)) {
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
