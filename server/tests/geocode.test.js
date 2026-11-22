import { jest } from '@jest/globals';
import { _clearGeocodeCache, searchAddress, toPlace } from '../src/services/geocode.js';

describe('geocoding (FR-10)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    _clearGeocodeCache();
  });

  it('maps a Nominatim result to a place', () => {
    expect(toPlace({ display_name: 'Indiranagar, Bengaluru', lat: '12.97', lon: '77.64', address: { suburb: 'Indiranagar', city: 'Bengaluru' } }))
      .toEqual({ label: 'Indiranagar, Bengaluru', city: 'Bengaluru', lat: 12.97, lng: 77.64 });
  });

  it('sends an identifying User-Agent, restricts to the country, and caches results', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'MG Road, Bengaluru', lat: '12.97', lon: '77.6', address: { city: 'Bengaluru' } }],
    });
    const first = await searchAddress('MG Road Bengaluru');
    const second = await searchAddress('  mg road   bengaluru ');
    expect(first).toEqual(second);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, opts] = spy.mock.calls[0];
    expect(String(url)).toContain('countrycodes=in');
    expect(opts.headers['User-Agent']).toMatch(/ShipTrack/);
  });

  it('turns upstream failures into a 503', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 });
    await expect(searchAddress('somewhere new')).rejects.toMatchObject({ status: 503 });
  });
});
