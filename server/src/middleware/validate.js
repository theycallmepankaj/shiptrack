// Usage: router.post('/', validate(schema), handler) — validates req.body with a Zod schema.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  req[source] = schema.parse(req[source]);
  next();
};
