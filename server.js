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

// Emisi per Kampus
app.get("/emissions/campus", async (req, res) => {
    const { campus, year } = req.query;
    
    let query = supabase
        .from("device_usage")
        .select("usage_hours, year, month, devices(device_power, rooms(buildings(campuses(campus_name))))");

    // Filter berdasarkan kampus (jika diberikan)
    if (campus) {
        query = query.eq("devices.rooms.buildings.campuses.campus_name", campus);
    }

    // Filter berdasarkan tahun (jika diberikan)
    if (year) {
        query = query.eq("year", year);
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    let emissionsData = {};

    data.forEach((usage) => {
        const campusName = usage.devices.rooms.buildings.campuses.campus_name;
        const emission = usage.devices.device_power * usage.usage_hours * 0.0004;
        const dataKey = year ? usage.month : usage.year; // Gunakan bulan jika year disertakan, gunakan tahun jika tidak.

        if (!emissionsData[campusName]) emissionsData[campusName] = {};
        emissionsData[campusName][dataKey] = (emissionsData[campusName][dataKey] || 0) + emission;
    });

    res.json({
        filter: { campus: campus || "All", year: year || "All" },
        emissions: emissionsData,
    });
});

// Emisi Per Gedung
app.get("/emissions/building/:year/:month", async (req, res) => {
    const { year, month } = req.params;
    const { data, error } = await supabase
        .from("device_usage")
        .select("usage_hours, devices(device_power, rooms(buildings(building_name)))")
        .eq("year", year)
        .eq("month", month);

    if (error) return res.status(400).json({ error: error.message });

    const emissionsByBuilding = {};
    data.forEach((usage) => {
        const building = usage.devices.rooms.buildings.building_name;
        const emission = usage.devices.device_power * usage.usage_hours * 0.0004;
        emissionsByBuilding[building] = (emissionsByBuilding[building] || 0) + emission;
    });

    res.json({ year, month, emissions: emissionsByBuilding });
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
