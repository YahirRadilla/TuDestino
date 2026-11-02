export function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.baseUrl + req.path,
          status: res.statusCode,
          ms: Number(process.hrtime.bigint() - start) / 1e6,
        },
        'request',
      );
    });
    next();
  };
}
