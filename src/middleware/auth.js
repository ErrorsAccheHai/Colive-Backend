const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  const token = req.header('Authorization')?.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Standardize user info for consistent access across routes
    req.user = {
      _id: decoded.userId, // Add _id for mongoose compatibility
      userId: decoded.userId,
      role: decoded.role,
      name: decoded.name, // Include name from token
      iat: decoded.iat,
      exp: decoded.exp
    };
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
