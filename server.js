// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const jwt = require('jsonwebtoken'); // Perlu dipasang: npm install jsonwebtoken


async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Cek ke Supabase apakah token valid
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      console.warn('🔒 Invalid token:', error?.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // 2. Decode token & cek expiry time secara manual (opsional tapi disarankan)
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return res.status(401).json({ error: 'Unauthorized: Token malformed' });
    }

    const now = Math.floor(Date.now() / 1000); // Waktu sekarang (dalam detik)
    if (decoded.exp < now) {
      console.warn('🔒 Token expired at', new Date(decoded.exp * 1000).toISOString());
      return res.status(401).json({ error: 'Unauthorized: Token expired' });
    }

    req.user = data.user; // user info bisa digunakan di handler
    next();
  } catch (err) {
    console.error('❌ Error during auth middleware:', err);
    return res.status(500).json({ error: 'Internal Server Error during authentication' });
  }
}



const app = express();
const PORT = process.env.PORT || 5000; // Gunakan PORT dari env jika ada

// 🔐 Supabase client
// Pastikan SUPABASE_URL dan SUPABASE_KEY ada di file .env Anda
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("❌ Error: SUPABASE_URL and SUPABASE_KEY must be defined in your .env file");
    process.exit(1); // Hentikan server jika kunci Supabase tidak ada
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors()); // Aktifkan CORS untuk semua origin (sesuaikan jika perlu untuk produksi)
app.use(express.json()); // Middleware untuk parsing body JSON


// Register
app.post("/users/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    try {
        // Cek apakah email sudah ada (menggunakan listUsers karena signUp tidak selalu memberitahu jika user sudah ada)
        const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
        if (listError) {
            console.error("Supabase listUsers error:", listError.message);
            // Jangan ekspos detail error ke user
            return res.status(500).json({ error: "Failed to verify user existence." });
        }

        const userExists = existingUsers?.users.some((u) => u.email === username);
        if (userExists) {
            return res.status(400).json({ error: "Email already in use. Please login instead." });
        }

        // Daftarkan user baru
        const { data: userData, error: signUpError } = await supabase.auth.signUp({ email: username, password });
        if (signUpError) {
            console.error("Supabase signUp error:", signUpError.message);
            return res.status(400).json({ error: signUpError.message }); // Kembalikan pesan error Supabase
        }

        // Hindari mengirim kembali semua data user, terutama jika ada info sensitif
        res.status(201).json({ message: "Registration successful. Please check your email for verification." });

    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "An unexpected error occurred during registration." });
    }
});

// Login
app.post("/users/login", async (req, res) => {
    const { username, password } = req.body;
     if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });

        if (error) {
             // Error login bisa karena email tidak ada atau password salah
             console.warn(`Login attempt failed for ${username}:`, error.message);
             return res.status(401).json({ error: "Invalid login credentials." }); // Pesan generik lebih aman
        }
        res.json({ message: "Login successful", token: data.session.access_token, userId: data.user.id }); // Kembalikan token

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "An unexpected error occurred during login." });
    }
});

// Forgot Password
app.post("/users/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    try {
         // Tidak perlu cek manual, resetPasswordForEmail sudah handle jika email tidak ada
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            // Pastikan URL redirect ini benar dan bisa menangani proses reset
            redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL || "http://localhost:3000/reset-password",
        });

        if (error) {
            console.error("Supabase password reset error:", error.message);
             // Jangan beritahu jika email tidak ada, ini bisa jadi info leak
             // Cukup kirim pesan sukses generik
        }

         // Selalu kirim pesan sukses untuk mencegah penyerang mengetahui email mana yg terdaftar
        res.json({ message: "If an account with this email exists, a password reset link has been sent." });

    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: "An unexpected error occurred." });
    }
});


// ✅ Tambah perangkat lengkap dengan kampus, gedung, ruangan, dan penggunaan bulanan
app.post("/device-usages", authenticateUser, async (req, res) => { // Path diubah sesuai frontend
  const {
    device_id,
    device_name,
    device_power,
    campus_name,
    building_name,
    room_name,
    usage_hours,
    year,
    month,
  } = req.body;

  // Basic validation
  if (
    !device_name ||
    !device_power ||
    !campus_name ||
    !building_name ||
    !room_name ||
    usage_hours == null ||
    !year ||
    !month
  ) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  if (isNaN(+device_power) || +device_power <= 0) {
    return res.status(400).json({ error: 'device_power must be a positive number.' });
  }

  if (isNaN(+usage_hours) || +usage_hours < 0) {
    return res.status(400).json({ error: 'usage_hours must be a non-negative number.' });
  }

  if (isNaN(+year) || isNaN(+month) || +month < 1 || +month > 12) {
    return res.status(400).json({ error: 'Invalid year or month.' });
  }

  try {
    // Check if data already exists
    const { data: existingData, error: checkError } = await supabase
      .from('Device_usage')
      .select('id')
      .eq('device_id', device_id)
      .eq('year', +year)
      .eq('month', +month)
      .maybeSingle();

    if (checkError) throw new Error(`Checking existing data: ${checkError.message}`);

    if (existingData) {
      return res.status(409).json({
        error: 'Data untuk device tersebut pada bulan dan tahun yang sama sudah ada.',
      });
    }

    // Insert new data
    const { data: usageData, error: usageError } = await supabase
      .from('Device_usage')
      .insert([
        {
          device_id,
          usage_hours: +usage_hours,
          year: +year,
          month: +month,
        },
      ])
      .select()
      .single();

    if (usageError) throw new Error(`Inserting device usage: ${usageError.message}`);

    res.status(201).json({
      message: '✅ Device and usage data saved successfully!',
      usage: usageData,
    });
  } catch (err) {
    console.error('❌ Error processing device input:', err.message);
    res.status(500).json({ error: `Failed to save data: ${err.message}` });
  }
});

app.get("/device-usages", async (req, res) => {
    const { device_id } = req.query;

    // Validasi input
    if (!device_id) {
        return res.status(400).json({ error: "device_id is required as query parameter." });
    }

    try {
        const { data, error } = await supabase
            .from("Device_usage")
            .select("*")
            .eq("device_id", device_id)
            .order("year", { ascending: true })
            .order("month", { ascending: true });

        if (error) throw error;

        res.status(200).json({
            device_id: device_id,
            usage_records: data
        });
    } catch (err) {
        console.error("❌ Error fetching device usage:", err.message);
        res.status(500).json({ error: `Failed to fetch device usage: ${err.message}` });
    }
});


app.put("/device-usages", authenticateUser, async (req, res) => {
    const { usage_id, device_id, year, month, usage_hours } = req.body;

    // Validasi input
    if (!usage_id || !device_id || !year || !month || usage_hours == null) {
        return res.status(400).json({ error: "All fields are required." });
    }

    if (isNaN(parseInt(usage_hours)) || parseInt(usage_hours) < 0) {
        return res.status(400).json({ error: "usage_hours must be a non-negative number." });
    }

    if (isNaN(parseInt(year)) || isNaN(parseInt(month)) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month." });
    }

    try {
        const { data, error } = await supabase
            .from("Device_usage")
            .update({
                device_id: parseInt(device_id),
                year: parseInt(year),
                month: parseInt(month),
                usage_hours: parseInt(usage_hours)
            })
            .eq("usage_id", usage_id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            message: "✅ Device usage updated successfully.",
            updated_usage: data
        });
    } catch (err) {
        console.error("❌ Update error:", err.message);
        res.status(500).json({ error: `Failed to update device usage: ${err.message}` });
    }
});

app.delete("/device-usages", authenticateUser, async (req, res) => {
    const { usage_id } = req.body;

    // Validasi input
    if (!usage_id) {
        return res.status(400).json({ error: "usage_id is required." });
    }

    try {
        const { data, error } = await supabase
            .from("Device_usage")
            .delete()
            .eq("usage_id", usage_id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            message: "✅ Device usage deleted successfully.",
            deleted_usage: data
        });
    } catch (err) {
        console.error("❌ Delete error:", err.message);
        res.status(500).json({ error: `Failed to delete device usage: ${err.message}` });
    }
});




app.get("/emissions/campus", async (req, res) => {
    let { campus = "All", year = "All" } = req.query;

    try {
        // Query pre-aggregated emissions
        let query = supabase.from("aggregated_emissions_by_campus").select("*");

        // Apply filters if not "All"
        if (campus !== "All") query = query.eq("campus_name", campus);
        if (year !== "All") query = query.eq("year", parseInt(year));

        const { data: aggregatedData, error } = await query;

        if (error) throw new Error(error.message);

        // Restructure the data
        const emissionsByCampus = {};
        const totalEmissionsByCampus = {};

        aggregatedData.forEach(row => {
            const campusName = row.campus_name;
            const yearKey = row.year;
            const monthKey = row.month;
            const emission = parseFloat(row.emission);

            // Init structure
            if (!emissionsByCampus[campusName]) {
                emissionsByCampus[campusName] = {};
                totalEmissionsByCampus[campusName] = 0;
            }

            totalEmissionsByCampus[campusName] += emission;

            // Aggregation key logic
            let aggregationKey;
            if (year !== "All" && campus !== "All") aggregationKey = monthKey;
            else if (year !== "All" && campus === "All") aggregationKey = monthKey;
            else aggregationKey = yearKey;

            emissionsByCampus[campusName][aggregationKey] = 
                (emissionsByCampus[campusName][aggregationKey] || 0) + emission;
        });

        // Round results
        for (const camp in totalEmissionsByCampus) {
            totalEmissionsByCampus[camp] = parseFloat(totalEmissionsByCampus[camp].toFixed(3));
        }
        for (const camp in emissionsByCampus) {
            for (const key in emissionsByCampus[camp]) {
                emissionsByCampus[camp][key] = parseFloat(emissionsByCampus[camp][key].toFixed(3));
            }
        }

        res.json({
            filter: { campus, year },
            emissions: emissionsByCampus,
            total_emissions: totalEmissionsByCampus,
        });
    } catch (err) {
        console.error("Server error fetching campus emissions:", err.message);
        res.status(500).json({ error: err.message || "Server error" });
    }
});

app.get("/emissions/building", async (req, res) => {
    let { campus = "All", year = "All" } = req.query;

    try {
        const pageSize = 1000;
        let from = 0;
        let to = pageSize - 1;
        let done = false;
        let allData = [];

        // Loop to paginate through the Supabase view
        while (!done) {
            let query = supabase
                .from("aggregated_emissions_by_building_and_room")
                .select("*")
                .range(from, to);

            if (campus !== "All") query = query.eq("campus_name", campus);
            if (year !== "All") query = query.eq("year", parseInt(year));

            const { data, error } = await query;

            if (error) throw new Error(error.message);
            if (!data || data.length === 0) break;

            allData = allData.concat(data);

            if (data.length < pageSize) {
                done = true;
            } else {
                from += pageSize;
                to += pageSize;
            }
        }

        // Process the aggregated data
        let emissionsByBuilding = {}; // { buildingName: { total_emission, rooms: { roomName: emission } } }

        allData.forEach(row => {
            const { building_name, room_name, emission } = row;
            if (!building_name || !room_name || emission == null) {
                console.warn("Skipping incomplete data:", row);
                return;
            }

            if (!emissionsByBuilding[building_name]) {
                emissionsByBuilding[building_name] = { total_emission: 0, rooms: {} };
            }

            emissionsByBuilding[building_name].total_emission += emission;
            emissionsByBuilding[building_name].rooms[room_name] =
                (emissionsByBuilding[building_name].rooms[room_name] || 0) + emission;
        });

        // Round results
        for (const building in emissionsByBuilding) {
            emissionsByBuilding[building].total_emission =
                parseFloat(emissionsByBuilding[building].total_emission.toFixed(3));
            for (const room in emissionsByBuilding[building].rooms) {
                emissionsByBuilding[building].rooms[room] =
                    parseFloat(emissionsByBuilding[building].rooms[room].toFixed(3));
            }
        }

        res.json({
            filter: { campus, year },
            buildings: emissionsByBuilding,
        });

    } catch (err) {
        console.error("Server error fetching building emissions:", err.message);
        res.status(500).json({ error: err.message || "Server error" });
    }
});



app.get("/emissions/device", async (req, res) => {
    let { campus = "All", year = "All" } = req.query;

    try {
        let query = supabase.from("aggregated_emissions_by_device").select("*");

        if (campus !== "All") query = query.eq("campus_name", campus);
        if (year !== "All") query = query.eq("year", parseInt(year));

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        const emissionsByDeviceName = {};

        data.forEach(row => {
            const { device_name, total_emission } = row;
            if (!device_name || total_emission == null) {
                console.warn("Skipping invalid row:", row);
                return;
            }

            emissionsByDeviceName[device_name] = 
                (emissionsByDeviceName[device_name] || 0) + parseFloat(total_emission);
        });

        // Round results
        for (const device in emissionsByDeviceName) {
            emissionsByDeviceName[device] = parseFloat(emissionsByDeviceName[device].toFixed(3));
        }

        res.json({
            filter: { campus, year },
            device_emissions: emissionsByDeviceName,
        });

    } catch (err) {
        console.error("Server error fetching device emissions:", err.message);
        res.status(500).json({ error: err.message || "Server error" });
    }
});

// Get Kampus 
app.get("/campuses", async (req, res) => {
    try {
        const { data, error } = await supabase.from("Campuses").select("campus_name");
        if (error) throw error;
        const sortedCampuses = data ? data.sort((a, b) => a.campus_name.localeCompare(b.campus_name)) : [];
        // Kembalikan format { campuses: [ { campus_name: "A" }, ... ] } agar konsisten
        res.json({ campuses: sortedCampuses });
    } catch (err) {
        console.error("Server error fetching campuses:", err.message);
        res.status(500).json({ error: `Database error: ${err.message}` });
    }
});

// Get Building berdasarkan Nama Kampus
app.get("/buildings", async (req, res) => {
    const { campus_name } = req.query;
    if (!campus_name) return res.json({ buildings: [] }); // Penting untuk dropdown dependen

    try {
        const { data: campusData, error: campusError } = await supabase
            .from("Campuses").select("campus_id").eq("campus_name", campus_name).maybeSingle();
        if (campusError) throw new Error(`Finding campus ID: ${campusError.message}`);
        if (!campusData) return res.json({ buildings: [] });

        const { data: buildingData, error: buildingError } = await supabase
            .from("Buildings").select("building_name").eq("campus_id", campusData.campus_id);
        if (buildingError) throw new Error(`Fetching buildings: ${buildingError.message}`);

        const buildingNames = buildingData ? buildingData.map(b => b.building_name).sort((a, b) => a.localeCompare(b)) : [];
        // Kembalikan format { buildings: ["Building A", "Building B"] } sesuai ekspektasi frontend
        res.json({ buildings: buildingNames });

    } catch (err) {
        console.error(`Server error fetching buildings for ${campus_name}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get Room berdasarkan Nama Gedung
app.get("/rooms", async (req, res) => {
    const { building_name } = req.query;
    if (!building_name) return res.json({ rooms: [] }); // Penting untuk dropdown dependen

    try {
        const { data: buildingData, error: buildingError } = await supabase
            .from("Buildings")
            .select("building_id")
            .eq("building_name", building_name)
            .maybeSingle();

        if (buildingError) throw new Error(`Finding building ID: ${buildingError.message}`);
        if (!buildingData) return res.json({ rooms: [] });

        const { data: roomData, error: roomError } = await supabase
            .from("Rooms")
            .select("room_id, room_name")
            .eq("building_id", buildingData.building_id);

        if (roomError) throw new Error(`Fetching rooms: ${roomError.message}`);

        // Kembalikan format { rooms: [{ room_name: "...", room_id: ... }, ...] }
        const rooms = roomData
            ? roomData
                .map(r => ({ room_name: r.room_name, room_id: r.room_id }))
                .sort((a, b) => a.room_name.localeCompare(b.room_name))
            : [];

        res.json({ rooms });

    } catch (err) {
        console.error(`Server error fetching rooms for ${building_name}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});


app.get("/devices", async (req, res) => {
    const { room_name, building_name } = req.query;

    if (!room_name || !building_name) {
        return res.status(400).json({ error: "Both room_name and building_name are required." });
    }

    try {
        // 1. Cari building_id berdasarkan building_name
        const { data: buildingData, error: buildingError } = await supabase
            .from("Buildings")
            .select("building_id")
            .eq("building_name", building_name)
            .maybeSingle();

        if (buildingError) throw new Error(`Finding building: ${buildingError.message}`);
        if (!buildingData) {
            return res.status(404).json({ error: "Building not found." });
        }

        // 2. Cari room_id berdasarkan room_name dan building_id
        const { data: roomData, error: roomError } = await supabase
            .from("Rooms")
            .select("room_id")
            .eq("room_name", room_name)
            .eq("building_id", buildingData.building_id)
            .maybeSingle();

        if (roomError) throw new Error(`Finding room: ${roomError.message}`);
        if (!roomData) {
            return res.status(404).json({ error: "Room not found in the specified building." });
        }

        // 3. Ambil semua devices yang berada di ruangan tersebut
        const { data: devices, error: devicesError } = await supabase
            .from("Devices")
            .select("device_id, device_name, device_power")
            .eq("room_id", roomData.room_id);

        if (devicesError) throw new Error(`Fetching devices: ${devicesError.message}`);

        res.json({
            building_name,
            room_name,
            devices,
        });

    } catch (err) {
        console.error("Error fetching devices by room and building:", err.message);
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
});



// input device
app.post("/devices", authenticateUser, async (req, res) => {
    const { device_name, device_power, room_id } = req.body;

    // Validasi input
    if (!device_name || !device_power || !room_id) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    if (isNaN(device_power) || device_power <= 0) {
        return res.status(400).json({ error: "device_power must be a positive number." });
    }

    try {
        const { data, error } = await supabase
            .from("Devices")
            .insert([{ device_name, device_power, room_id }])
            .select("device_id, device_name, device_power, room_id")
            .single();

        if (error) {
            console.error("Error inserting device:", error.message);
            return res.status(500).json({ error: "Failed to add device." });
        }

        res.status(201).json({
            message: "Device added successfully.",
            device: data
        });
    } catch (err) {
        console.error("Server error:", err.message);
        res.status(500).json({ error: "Server error while adding device." });
    }
});

// update device
app.put("/devices/:device_id", authenticateUser, async (req, res) => {
    const device_id = parseInt(req.params.device_id);
    const { device_name, device_power, room_id } = req.body;

    // Validasi input
    if (!device_name || !device_power || !room_id) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        // Update hanya data dengan device_id yang cocok
        const { data, error } = await supabase
            .from("Devices")
            .update({
                device_name,
                device_power: parseInt(device_power),
                room_id: parseInt(room_id)
            })
            .eq("device_id", device_id)
            .select()
            .single();

        if (error) {
            console.error("Error updating device:", error.message);
            return res.status(500).json({ error: "Failed to update device." });
        }

        if (!data) {
            return res.status(404).json({ error: "Device not found." });
        }

        res.json({
            message: "Device updated successfully.",
            device: data
        });

    } catch (err) {
        console.error("Unexpected server error:", err.message);
        res.status(500).json({ error: "Server error while updating device." });
    }
});

app.delete("/devices/:device_id", authenticateUser, async (req, res) => {
    const { device_id } = req.params;

    if (!device_id) {
        return res.status(400).json({ error: "Device ID is required." });
    }

    try {
        // Cek apakah device ada
        const { data: existingDevice, error: fetchError } = await supabase
            .from("Devices")
            .select("*")
            .eq("device_id", device_id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!existingDevice) {
            return res.status(404).json({ error: "Device not found." });
        }

        // Hapus device
        const { error: deleteError } = await supabase
            .from("Devices")
            .delete()
            .eq("device_id", device_id);

        if (deleteError) throw deleteError;

        res.json({ message: "Device deleted successfully.", deleted_device_id: device_id });
    } catch (err) {
        console.error("Error deleting device:", err.message);
        res.status(500).json({ error: "Server error: " + err.message });
    }
});


app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});