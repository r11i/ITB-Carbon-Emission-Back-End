require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 5000;

// Konfigurasi Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

/**
 * 1️⃣ USER AUTHENTICATION
 */

// Register User
app.post("/users/register", async (req, res) => {
    const { username, password } = req.body;
    const { data, error } = await supabase.auth.signUp({
        email: username,
        password: password,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Pendaftaran berhasil", user: data });
});

// Login User
app.post("/users/login", async (req, res) => {
    const { username, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password: password,
    });
    if (error) return res.status(401).json({ error: "Login gagal" });
    res.json({ message: "Login berhasil", token: data.session.access_token });
});

/**
 * 2️⃣ DEVICE MANAGEMENT
 */

// Tambah Perangkat
app.post("/devices", async (req, res) => {
    const { device_name, device_power, room_id } = req.body;
    const { data, error } = await supabase
        .from("devices")
        .insert([{ device_name, device_power, room_id }])
        .select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Perangkat berhasil ditambahkan", device: data });
});

// Hapus Perangkat
app.delete("/devices/:device_id", async (req, res) => {
    const { device_id } = req.params;
    const { error } = await supabase.from("devices").delete().eq("device_id", device_id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Perangkat berhasil dihapus" });
});

/**
 * 3️⃣ EMISSION CALCULATIONS
 */

// Total Emisi Karbon
app.get("/emissions/total/:year/:month", async (req, res) => {
    const { year, month } = req.params;
    const { data, error } = await supabase
        .from("device_usage")
        .select("usage_hours, devices(device_power)")
        .eq("year", year)
        .eq("month", month);

    if (error) return res.status(400).json({ error: error.message });

    let totalEmission = 0;
    data.forEach((usage) => {
        totalEmission += usage.devices.device_power * usage.usage_hours * 0.0004;
    });

    res.json({ year, month, total_emission: totalEmission, unit: "kg CO2" });
});

async function fetchAllEmissions() {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let done = false;
  
    while (!done) {
      const { data, error } = await supabase
        .from("emissions_view")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);
  
      if (error) throw new Error(error.message);
  
      allData.push(...data);
      if (data.length < pageSize) {
        done = true;
      } else {
        page++;
      }
    }
  
    return allData;
  }

// Emisi per Kampus
app.get("/emissions/campus", async (req, res) => {
  let { campus = "All", year = "All" } = req.query;

  try {
    const pageSize = 1000;
    let allData = [];
    let from = 0;
    let to = pageSize - 1;
    let done = false;

    // Fetch in batches until all data is retrieved
    while (!done) {
      let query = supabase.from("emissions_view").select("*").range(from, to);

      if (campus !== "All") {
        query = query.ilike("campus_name", campus);
      }
      if (year !== "All") {
        query = query.eq("year", parseInt(year));
      }

      const { data, error } = await query;

      if (error) {
        console.error("Supabase error:", error.message);
        return res.status(500).json({ error: error.message });
      }

      if (!data || data.length === 0) {
        done = true;
      } else {
        allData = allData.concat(data);
        if (data.length < pageSize) done = true;
        else {
          from += pageSize;
          to += pageSize;
        }
      }
    }

    let emissionsData = {};
    let totalEmissions = {};

    allData.forEach((usage) => {
      const campusName = usage.campus_name;
      const emission = usage.device_power * usage.usage_hours * 0.0004;
      const yearKey = usage.year;
      const monthKey = usage.month;

      // Init if not exists
      if (!emissionsData[campusName]) {
        emissionsData[campusName] = {};
        totalEmissions[campusName] = 0;
      }

      totalEmissions[campusName] += emission;

      // Handle groupings based on filters
      if (campus !== "All" && year !== "All") {
        emissionsData[campusName][monthKey] = (emissionsData[campusName][monthKey] || 0) + emission;
      } else if (campus !== "All" && year === "All") {
        emissionsData[campusName][yearKey] = (emissionsData[campusName][yearKey] || 0) + emission;
      } else if (campus === "All" && year !== "All") {
        emissionsData[campusName][monthKey] = (emissionsData[campusName][monthKey] || 0) + emission;
      } else {
        emissionsData[campusName][yearKey] = (emissionsData[campusName][yearKey] || 0) + emission;
      }
    });

    res.json({
      filter: { campus, year },
      emissions: emissionsData,
      total_emissions: totalEmissions,
    });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Emisi per gedung
app.get("/emissions/building", async (req, res) => {
  let { campus = "All", year = "All" } = req.query;

  try {
    let page = 0;
    const pageSize = 1000;
    let allData = [];
    let more = true;

    while (more) {
      let query = supabase
        .from("building_emissions_view")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (campus !== "All") query = query.ilike("campus_name", campus);
      if (year !== "All") query = query.eq("year", parseInt(year));

      const { data, error } = await query;

      if (error) {
        console.error("Supabase error:", error.message);
        return res.status(500).json({ error: error.message });
      }

      allData = allData.concat(data);
      if (data.length < pageSize) more = false;
      else page++;
    }

    let result = {};

    allData.forEach((row) => {
      const { campus_name, building_name, room_name, device_power, usage_hours } = row;
      const emission = device_power * usage_hours * 0.0004;

      if (!result[building_name]) {
        result[building_name] = {
          total_emission: 0,
          rooms: {},
        };
      }

      result[building_name].total_emission += emission;

      if (!result[building_name].rooms[room_name]) {
        result[building_name].rooms[room_name] = 0;
      }

      result[building_name].rooms[room_name] += emission;
    });

    res.json({
      filter: { campus, year },
      buildings: result,
    });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Emisi per device
app.get("/emissions/device", async (req, res) => {
  let { campus = "All", year = "All" } = req.query;

  try {
    const pageSize = 1000;
    let page = 0;
    let allData = [];
    let more = true;

    while (more) {
      let query = supabase
        .from("device_emissions_view")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (campus !== "All") query = query.ilike("campus_name", campus);
      if (year !== "All") query = query.eq("year", parseInt(year));

      const { data, error } = await query;

      if (error) {
        console.error("Supabase error:", error.message);
        return res.status(500).json({ error: error.message });
      }

      allData = allData.concat(data);
      if (data.length < pageSize) more = false;
      else page++;
    }

    let result = {};

    allData.forEach((row) => {
      const { device_name, device_power, usage_hours } = row;
      const emission = device_power * usage_hours * 0.0004;

      if (!result[device_name]) {
        result[device_name] = 0;
      }

      result[device_name] += emission;
    });

    res.json({
      filter: { campus, year },
      device_emissions: result,
    });

  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});


/**
 * 4️⃣ DATA STORAGE
 */

// Simpan Data Penggunaan Perangkat
app.post("/device_usage", async (req, res) => {
    const { device_id, year, month, usage_hours } = req.body;
    const { data, error } = await supabase
        .from("device_usage")
        .insert([{ device_id, year, month, usage_hours }])
        .select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: "Data penggunaan berhasil disimpan", data });
});

/**
 * 5️⃣ FILTER EMISSION DATA
 */

// Filter Periode Penggunaan Perangkat
app.get("/emissions/filter", async (req, res) => {
    const { year, month } = req.query;
    const { data, error } = await supabase
        .from("device_usage")
        .select("*")
        .eq("year", year)
        .eq("month", month);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ year, month, usage_data: data });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
