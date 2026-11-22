import { reverseGeocode, searchAddress } from '../services/geocode.js';

export async function search(req, res) {
  res.json({ results: await searchAddress(req.query.q) });
}

export async function reverse(req, res) {
  res.json({ place: await reverseGeocode(req.query.lat, req.query.lng) });
}
