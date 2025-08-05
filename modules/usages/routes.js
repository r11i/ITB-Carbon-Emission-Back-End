const express = require("express");
const router = express.Router();
const controller = require("./controller");
const authenticateUser = require("../../middlewares/authenticateUser");

router.post("/", authenticateUser, controller.createUsage);
router.put("/", authenticateUser, controller.updateUsage);
router.delete("/", authenticateUser, controller.deleteUsage);
router.get("/", controller.getDeviceUsageByDeviceId);

module.exports = router;