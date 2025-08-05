const jwt = require('jsonwebtoken');
const supabase = require("../lib/supabaseClient");
const ADMIN_EMAIL = "carbonemissiondashboarda@gmail.com";

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    const decoded = jwt.decode(token);
    if (!decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Unauthorized: Token expired or malformed' });
    }

    if (req.path === "/register" && data.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: "Forbidden: Only admin can register users" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: 'Internal Server Error during authentication' });
  }
}

module.exports = authenticateUser;