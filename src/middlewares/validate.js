const AppError = require('../utils/app-error');

function formatJoiDetails(error) {
  return error.details.map((d) => ({
    path: d.path.join('.') || '(root)',
    message: d.message,
  }));
}

/**
 * Request validation using Joi schemas.
 * Pass `{ body?, query?, params? }` with Joi schemas. Validated values are
 * assigned back to req (merged params replace req.params).
 */
function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    try {
      if (schemas.body) {
        const { error, value } = schemas.body.validate(req.body ?? {}, {
          abortEarly: false,
          stripUnknown: true,
        });
        if (error) {
          throw error;
        }
        req.body = value;
      }
      if (schemas.query) {
        const { error, value } = schemas.query.validate(req.query ?? {}, {
          abortEarly: false,
          stripUnknown: true,
        });
        if (error) {
          throw error;
        }
        Object.assign(req.query, value);
      }
      if (schemas.params) {
        const { error, value } = schemas.params.validate(req.params ?? {}, {
          abortEarly: false,
          stripUnknown: true,
        });
        if (error) {
          throw error;
        }
        Object.assign(req.params, value);
      }
      next();
    } catch (err) {
      if (err && err.isJoi) {
        return next(
          new AppError('Validation failed', 422, {
            code: 'VALIDATION_ERROR',
            details: formatJoiDetails(err),
          }),
        );
      }
      next(err);
    }
  };
}

module.exports = validate;
