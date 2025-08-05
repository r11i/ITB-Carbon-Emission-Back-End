const express = require("express");
const router = express.Router();
const controller = require("./controller");
const authenticateUser = require("../../middlewares/authenticateUser");

router.post("/register", authenticateUser, controller.register);
router.post("/login", controller.login);
router.post("/forgot-password", controller.forgotPassword);

module.exports = router;
