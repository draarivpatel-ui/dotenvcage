import { diffDotenv, parseDotenv, validateSchema } from 'dotenvcage';

const development = 'PORT=8080\nMODE=development\n';
const production = 'PORT=443\nMODE=production\n';

const parsed = parseDotenv(production);
validateSchema(parsed.values, {
  required: ['PORT', 'MODE'],
  keys: {
    PORT: { type: 'integer', min: 1, max: 65535 },
    MODE: { type: 'enum', values: ['development', 'test', 'production'] },
  },
});

console.log(diffDotenv(development, production));
