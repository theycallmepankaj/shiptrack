import { assertTransition, canTransition, isTerminal, TRANSITIONS } from '../src/services/shipmentStatus.js';

describe('status lifecycle (§4.3)', () => {
  it('follows the happy path', () => {
    const path = ['BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('supports failed attempt → retry or return', () => {
    expect(canTransition('OUT_FOR_DELIVERY', 'FAILED_ATTEMPT')).toBe(true);
    expect(canTransition('FAILED_ATTEMPT', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransition('FAILED_ATTEMPT', 'RETURNED')).toBe(true);
  });

  it('only allows cancelling before pickup', () => {
    expect(canTransition('BOOKED', 'CANCELLED')).toBe(true);
    expect(canTransition('ASSIGNED', 'CANCELLED')).toBe(true);
    for (const s of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED']) expect(canTransition(s, 'CANCELLED')).toBe(false);
  });

  it('rejects skipping steps and moving backwards', () => {
    expect(canTransition('BOOKED', 'DELIVERED')).toBe(false);
    expect(canTransition('IN_TRANSIT', 'PICKED_UP')).toBe(false);
  });

  it('treats DELIVERED, RETURNED, CANCELLED as terminal', () => {
    expect(['DELIVERED', 'RETURNED', 'CANCELLED'].every(isTerminal)).toBe(true);
    expect(Object.keys(TRANSITIONS).filter(isTerminal)).toHaveLength(3);
  });

  it('enforces who may set which status', () => {
    expect(() => assertTransition('BOOKED', 'CANCELLED', 'customer')).not.toThrow();
    expect(() => assertTransition('ASSIGNED', 'PICKED_UP', 'customer')).toThrow(/can’t set/);
    expect(() => assertTransition('ASSIGNED', 'PICKED_UP', 'driver')).not.toThrow();
    expect(() => assertTransition('BOOKED', 'ASSIGNED', 'driver')).toThrow(/can’t set/);
    expect(() => assertTransition('BOOKED', 'ASSIGNED', 'admin')).not.toThrow();
    expect(() => assertTransition('BOOKED', 'DELIVERED', 'admin')).toThrow(/Can’t change/);
  });
});
