import { TeeworldsEcon } from './econ';

(async () => {
  await TeeworldsEcon.quickfire({ port: 4444, password: 'testpass' }, 'shutdown');
})();
