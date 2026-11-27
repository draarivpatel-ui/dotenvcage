import { safeLoad } from 'dotenvcage';

const target = {};
const result = safeLoad('PORT=8080\nHOST=localhost\n', {
  target,
  schema: {
    required: ['PORT'],
    keys: {
      PORT: { type: 'integer', min: 1, max: 65535 },
      HOST: { type: 'string', minLength: 1 },
    },
  },
});

console.log('loaded', result.loaded);
console.log('port', target.PORT);
