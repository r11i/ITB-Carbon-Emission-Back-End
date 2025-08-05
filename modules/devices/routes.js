const express = require("express");
const router = express.Router();
const controller = require("./controller");
const authenticateUser = require("../../middlewares/authenticateUser");

router.get("/", controller.getDevicesByRoom);
router.post("/", authenticateUser, controller.createDevice);
router.put("/:device_id", authenticateUser, controller.updateDevice);
router.delete("/:device_id", authenticateUser, controller.deleteDevice);

module.exports = router;
