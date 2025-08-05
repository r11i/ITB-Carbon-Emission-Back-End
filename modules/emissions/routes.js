const express = require("express");
const router = express.Router();
const controller = require("./controller");

router.get("/campus", controller.getEmissionsByCampus);
router.get("/building", controller.getEmissionsByBuilding);
router.get("/device", controller.getEmissionsByDevice);

module.exports = router;