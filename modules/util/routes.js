const express = require("express");
const router = express.Router();
const controller = require("./controller");

router.get("/campuses", controller.getAllCampuses);
router.get("/buildings", controller.getBuildingsByCampus);
router.get("/rooms", controller.getRoomsByBuilding);

module.exports = router;