import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const MAX_BYTES = 5 * 1024 * 1024;

/** Proof-of-delivery images held in memory, then validated by content and stored (services/storage.js). */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 2, fields: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
}).fields([{ name: 'photo', maxCount: 1 }, { name: 'signature', maxCount: 1 }]);

export function proofUpload(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Images must be under 5 MB'));
    next(ApiError.badRequest(err.message));
  });
}

const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_TYPES = { pdf: 'application/pdf', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain' };

/** FR-35: one policy document (PDF, Markdown or text) in memory; content is checked in the controller. */
const docParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOC_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => cb(null, Object.hasOwn(DOC_TYPES, file.originalname.split('.').pop().toLowerCase())),
}).single('file');

export function documentUpload(req, res, next) {
  docParser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('Documents must be under 10 MB'));
    next(ApiError.badRequest(err.message));
  });
}
