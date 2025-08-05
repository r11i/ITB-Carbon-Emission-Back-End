const express = require("express");
const cors = require("cors");

const authRoutes = require("./modules/auth/routes");
const deviceRoutes = require("./modules/devices/routes");
const usageRoutes = require("./modules/usages/routes");
const emissionRoutes = require("./modules/emissions/routes");
const utilRoutes = require("./modules/util/routes");

const app = express();
app.use(cors());
app.use(express.json());

// Mount routes
app.use("/users", authRoutes);
app.use("/devices", deviceRoutes);
app.use("/device-usages", usageRoutes);
app.use("/emissions", emissionRoutes);
app.use("/", utilRoutes);

module.exports = app;