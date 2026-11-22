import { socketAuth } from '../src/sockets/index.js';
import { signAccessToken } from '../src/utils/tokens.js';

const run = (token) =>
  new Promise((resolve) => {
    const socket = { handshake: { auth: token ? { token } : {} } };
    socketAuth(socket, (err) => resolve({ err, socket }));
  });

describe('socket handshake auth (FR-7)', () => {
  it('rejects missing and invalid tokens', async () => {
    expect((await run()).err?.message).toBe('unauthorized');
    expect((await run('garbage')).err?.message).toBe('unauthorized');
  });

  it('accepts a valid token and attaches the user', async () => {
    const { err, socket } = await run(signAccessToken({ _id: '507f1f77bcf86cd799439011', role: 'driver', name: 'R' }));
    expect(err).toBeUndefined();
    expect(socket.user).toEqual({ id: '507f1f77bcf86cd799439011', role: 'driver', name: 'R' });
  });
});
