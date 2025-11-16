/*module.exports = function(allowedRoles) {
  // Convert string to array if single role passed
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    // Check if user and role exist
    if (!req.user || !req.user.role) {
      return res.status(401).json({ msg: 'No role found in token' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Forbidden: insufficient role' });
    }
    next();
  };
};
*/
module.exports = function(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ msg: 'No role found in token' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        msg: `Forbidden: ${req.user.role} cannot access this resource`
      });
    }

    next();
  };
};
