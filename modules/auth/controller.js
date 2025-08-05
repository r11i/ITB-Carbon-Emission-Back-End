const supabase = require("../../lib/supabaseClient");

exports.register = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) return res.status(500).json({ error: "Failed to check existing users." });

    const userExists = users.users.find((u) => u.email === username);
    if (userExists) return res.status(400).json({ error: "Email already in use. Please login instead." });

    const { error: signUpError } = await supabase.auth.signUp({ email: username, password });
    if (signUpError) return res.status(400).json({ error: signUpError.message });

    return res.status(201).json({ message: "Registration successful. Please check your email for verification." });
  } catch (err) {
    return res.status(500).json({ error: "Unexpected server error." });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });
    if (error) return res.status(401).json({ error: "Invalid login credentials." });

    res.json({ message: "Login successful", token: data.session.access_token, userId: data.user.id });
  } catch (err) {
    res.status(500).json({ error: "An unexpected error occurred during login." });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL || "http://localhost:3000/reset-password",
    });
    res.json({ message: "If an account with this email exists, a password reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: "An unexpected error occurred." });
  }
};