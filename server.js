// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

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
app.post("/emissions/device_input", async (req, res) => { // Path diubah sesuai frontend
    const {
        device_name,
        device_power,
        campus_name,
        building_name,
        room_name,
        usage_hours,
        year,
        month,
    } = req.body;

    // Validasi input dasar
    if (!device_name || !device_power || !campus_name || !building_name || !room_name || usage_hours == null || !year || !month) {
        return res.status(400).json({ error: "Missing required fields." });
    }
    if (isNaN(parseInt(device_power)) || parseInt(device_power) <= 0) {
        return res.status(400).json({ error: "device_power must be a positive number." });
    }
     if (isNaN(parseInt(usage_hours)) || parseInt(usage_hours) < 0) {
        return res.status(400).json({ error: "usage_hours must be a non-negative number." });
    }
     if (isNaN(parseInt(year)) || isNaN(parseInt(month)) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month." });
    }


    try {
        // 1. Cari atau buat Kampus
        let { data: campusData, error: campusError } = await supabase
            .from("Campuses") // <-- Nama tabel kapital
            .select("campus_id")
            .eq("campus_name", campus_name)
            .maybeSingle();

        if (campusError) throw new Error(`Finding campus: ${campusError.message}`);

        if (!campusData) {
            console.log(`Campus "${campus_name}" not found, creating...`);
            const { data: newCampus, error: insertCampusError } = await supabase
                .from("Campuses") // <-- Nama tabel kapital
                .insert([{ campus_name }])
                .select("campus_id")
                .single();
            if (insertCampusError) throw new Error(`Creating campus: ${insertCampusError.message}`);
            campusData = newCampus;
            console.log(`Campus created with ID: ${campusData.campus_id}`);
        }

        // 2. Cari atau buat Gedung
        let { data: buildingData, error: buildingError } = await supabase
            .from("Buildings") // <-- Nama tabel kapital
            .select("building_id")
            .eq("building_name", building_name)
            .eq("campus_id", campusData.campus_id) // Pastikan gedung ada di kampus yg benar
            .maybeSingle();

        if (buildingError) throw new Error(`Finding building: ${buildingError.message}`);

        if (!buildingData) {
             console.log(`Building "${building_name}" in campus ID ${campusData.campus_id} not found, creating...`);
            const { data: newBuilding, error: insertBuildingError } = await supabase
                .from("Buildings") // <-- Nama tabel kapital
                .insert([{ building_name, campus_id: campusData.campus_id }])
                .select("building_id")
                .single();
            if (insertBuildingError) throw new Error(`Creating building: ${insertBuildingError.message}`);
            buildingData = newBuilding;
             console.log(`Building created with ID: ${buildingData.building_id}`);
        }

        // 3. Cari atau buat Ruangan
        let { data: roomData, error: roomError } = await supabase
            .from("Rooms") // <-- Nama tabel kapital
            .select("room_id")
            .eq("room_name", room_name)
            .eq("building_id", buildingData.building_id) // Pastikan ruangan ada di gedung yg benar
            .maybeSingle();

        if (roomError) throw new Error(`Finding room: ${roomError.message}`);

        if (!roomData) {
             console.log(`Room "${room_name}" in building ID ${buildingData.building_id} not found, creating...`);
            const { data: newRoom, error: insertRoomError } = await supabase
                .from("Rooms") // <-- Nama tabel kapital
                .insert([{ room_name, building_id: buildingData.building_id }])
                .select("room_id")
                .single();
            if (insertRoomError) throw new Error(`Creating room: ${insertRoomError.message}`);
            roomData = newRoom;
             console.log(`Room created with ID: ${roomData.room_id}`);
        }

        // 4. Masukkan Perangkat (Device)
        // Diasumsikan setiap input adalah device baru, jika perlu cek duplikat, tambahkan logika di sini
        const { data: deviceData, error: deviceError } = await supabase
            .from("Devices") // <-- Nama tabel kapital
            .insert([{ device_name, device_power: parseInt(device_power), room_id: roomData.room_id }])
            .select("device_id, device_name") // Select ID dan nama untuk response
            .single();
        if (deviceError) throw new Error(`Inserting device: ${deviceError.message}`);
        console.log(`Device "${deviceData.device_name}" inserted with ID: ${deviceData.device_id}`);

        // 5. Masukkan Data Penggunaan (Device_usage)
        // Perlu penanganan jika sudah ada data usage untuk device, bulan, tahun yg sama (update atau error?)
        // Saat ini: selalu insert baru
        const { data: usageData, error: usageError } = await supabase
            .from("Device_usage") // <-- Nama tabel sesuai gambar
            .insert([{
                device_id: deviceData.device_id,
                usage_hours: parseInt(usage_hours),
                year: parseInt(year),
                month: parseInt(month)
            }])
            .select()
            .single();
        if (usageError) throw new Error(`Inserting device usage: ${usageError.message}`);
        console.log(`Device usage inserted for device ID ${deviceData.device_id}, ${month}/${year}`);

        res.status(201).json({
            message: "✅ Device and usage data saved successfully!",
            device: deviceData, // Kembalikan info device yg baru dibuat
            usage: usageData,   // Kembalikan info usage yg baru dibuat
        });
    } catch (err) {
        console.error("❌ Error processing device input:", err.message);
        // Kembalikan pesan error yang lebih spesifik jika memungkinkan
        res.status(500).json({ error: `Failed to save data: ${err.message}` });
    }
});

// --- Helper untuk Fetch Semua Data dengan Pagination ---
// (Digunakan oleh endpoint emisi agregat di bawah)
async function fetchAllPaginatedData(viewName, filter = {}) {
    let allData = [];
    let page = 0;
    const pageSize = 1000; // Ukuran batch fetch Supabase
    let done = false;
    console.log(`Fetching all data from ${viewName} with filter:`, filter);

    while (!done) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        let query = supabase.from(viewName).select("*").range(from, to);

        // Terapkan filter (contoh: campus, year)
        if (filter.campus && filter.campus !== "All") {
            query = query.ilike("campus_name", `%${filter.campus}%`); // Gunakan ilike untuk case-insensitive
        }
        if (filter.year && filter.year !== "All") {
            query = query.eq("year", parseInt(filter.year));
        }
        // Tambahkan filter lain jika perlu

        const { data, error, count } = await query;

        if (error) {
            console.error(`Supabase error fetching page ${page} from ${viewName}:`, error.message);
            throw new Error(`Database error fetching ${viewName}: ${error.message}`);
        }

        // console.log(`Fetched page ${page} from ${viewName}: ${data?.length} rows`);
        if (data && data.length > 0) {
            allData = allData.concat(data);
        }

        if (!data || data.length < pageSize) {
            done = true; // Berhenti jika data yg diambil lebih sedikit dari page size
        } else {
            page++;
        }
    }
    console.log(`Total rows fetched from ${viewName}: ${allData.length}`);
    return allData;
}


// Emisi per Kampus (Menggunakan helper fetchAll)
app.get("/emissions/campus", async (req, res) => {
    let { campus = "All", year = "All" } = req.query;

    try {
        // Pastikan view 'emissions_view' ada dan kolomnya benar
        // View ini idealnya join: Device_usage -> Devices -> Rooms -> Buildings -> Campuses
        const allData = await fetchAllPaginatedData("emissions_view", { campus, year });

        let emissionsByCampus = {}; // { campusName: { year/month: emission } }
        let totalEmissionsByCampus = {}; // { campusName: totalEmission }

        const emissionFactor = 0.4; // Faktor emisi (kg CO2e / kWh)

        allData.forEach((usage) => {
            // Pastikan kolom ada di view
            if (!usage.campus_name || usage.device_power == null || usage.usage_hours == null || !usage.year || !usage.month) {
                console.warn("Skipping incomplete data from emissions_view:", usage);
                return;
            }

            const campusName = usage.campus_name;
            const kwh = usage.device_power * usage.usage_hours / 1000;
            const emission = kwh * emissionFactor;
            const yearKey = usage.year;
            const monthKey = usage.month;

            // Inisialisasi jika belum ada
            if (!emissionsByCampus[campusName]) {
                emissionsByCampus[campusName] = {};
                totalEmissionsByCampus[campusName] = 0;
            }

            totalEmissionsByCampus[campusName] += emission;

            // Agregasi berdasarkan filter
            let aggregationKey;
            if (year !== "All" && campus !== "All") aggregationKey = monthKey; // Detail per bulan jika tahun & kampus spesifik
            else if (year !== "All" && campus === "All") aggregationKey = monthKey; // Detail per bulan jika tahun spesifik
            else aggregationKey = yearKey; // Agregat per tahun jika tahun 'All' atau kampus 'All'

            emissionsByCampus[campusName][aggregationKey] = (emissionsByCampus[campusName][aggregationKey] || 0) + emission;

        });

        // Bulatkan hasil total
        for (const camp in totalEmissionsByCampus) {
            totalEmissionsByCampus[camp] = parseFloat(totalEmissionsByCampus[camp].toFixed(3));
        }
         // Bulatkan hasil agregasi per bulan/tahun
         for (const camp in emissionsByCampus) {
             for (const key in emissionsByCampus[camp]) {
                 emissionsByCampus[camp][key] = parseFloat(emissionsByCampus[camp][key].toFixed(3));
             }
         }

        res.json({
            filter: { campus, year },
            emissions: emissionsByCampus, // Data agregat per kampus (per bulan/tahun)
            total_emissions: totalEmissionsByCampus, // Total emisi per kampus utk periode filter
        });
    } catch (err) {
        console.error("Server error fetching campus emissions:", err.message);
        res.status(500).json({ error: err.message || "Server error" });
    }
});

// Emisi per gedung (Menggunakan helper fetchAll)
app.get("/emissions/building", async (req, res) => {
    let { campus = "All", year = "All" } = req.query;

    try {
         // Pastikan view 'building_emissions_view' ada
         const allData = await fetchAllPaginatedData("building_emissions_view", { campus, year });

         let emissionsByBuilding = {}; // { buildingName: { total_emission: X, rooms: { roomName: Y } } }
         const emissionFactor = 0.4;

         allData.forEach((row) => {
             if (!row.building_name || !row.room_name || row.device_power == null || row.usage_hours == null) {
                 console.warn("Skipping incomplete data from building_emissions_view:", row);
                 return;
             }
             const { building_name, room_name, device_power, usage_hours } = row;
             const kwh = device_power * usage_hours / 1000;
             const emission = kwh * emissionFactor;

             if (!emissionsByBuilding[building_name]) {
                 emissionsByBuilding[building_name] = { total_emission: 0, rooms: {} };
             }
             emissionsByBuilding[building_name].total_emission += emission;

             if (!emissionsByBuilding[building_name].rooms[room_name]) {
                 emissionsByBuilding[building_name].rooms[room_name] = 0;
             }
             emissionsByBuilding[building_name].rooms[room_name] += emission;
         });

          // Bulatkan hasil
         for (const building in emissionsByBuilding) {
             emissionsByBuilding[building].total_emission = parseFloat(emissionsByBuilding[building].total_emission.toFixed(3));
             for (const room in emissionsByBuilding[building].rooms) {
                 emissionsByBuilding[building].rooms[room] = parseFloat(emissionsByBuilding[building].rooms[room].toFixed(3));
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

// Emisi per device (nama device) (Menggunakan helper fetchAll)
app.get("/emissions/device", async (req, res) => {
    let { campus = "All", year = "All" } = req.query; // Frontend mengirim year saja saat ini

    try {
        // Pastikan view 'device_emissions_view' ada
        const allData = await fetchAllPaginatedData("device_emissions_view", { campus, year });

        let emissionsByDeviceName = {}; // { deviceName: total_kWh } - asumsi frontend perlu kWh
        // const emissionFactor = 0.4; // Tidak dipakai jika frontend perlu kWh

        allData.forEach((row) => {
             if (!row.device_name || row.device_power == null || row.usage_hours == null) {
                 console.warn("Skipping incomplete data from device_emissions_view:", row);
                 return;
             }
            const { device_name, device_power, usage_hours } = row;
            const kwh = device_power * usage_hours / 1000;
            // const emission = kwh * emissionFactor; // Hitung emisi jika perlu

            emissionsByDeviceName[device_name] = (emissionsByDeviceName[device_name] || 0) + kwh; // Akumulasi kWh
        });

         // Bulatkan hasil
        for (const deviceName in emissionsByDeviceName) {
            emissionsByDeviceName[deviceName] = parseFloat(emissionsByDeviceName[deviceName].toFixed(3));
        }


        res.json({
            filter: { campus, year },
            // Frontend mengharapkan 'device_emissions'
            device_emissions: emissionsByDeviceName, // Kirim total kWh per nama device
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
            .from("Buildings").select("building_id").eq("building_name", building_name).maybeSingle();
        if (buildingError) throw new Error(`Finding building ID: ${buildingError.message}`);
        if (!buildingData) return res.json({ rooms: [] });

        const { data: roomData, error: roomError } = await supabase
            .from("Rooms").select("room_name").eq("building_id", buildingData.building_id);
        if (roomError) throw new Error(`Fetching rooms: ${roomError.message}`);

        const roomNames = roomData ? roomData.map(r => r.room_name).sort((a, b) => a.localeCompare(b)) : [];
         // Kembalikan format { rooms: ["Room 1", "Room 2"] } sesuai ekspektasi frontend
        res.json({ rooms: roomNames });

    } catch (err) {
        console.error(`Server error fetching rooms for ${building_name}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// Device Table
app.get("/emissions/device/raw", async (req, res) => {
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
  
      res.json({
        filter: { campus, year },
        raw_device_data: allData,
      });
  
    } catch (err) {
      console.error("Server error:", err.message);
      res.status(500).json({ error: "Server error" });
    }
  });

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});