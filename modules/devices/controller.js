const supabase = require("../../lib/supabaseClient");

exports.getDevicesByRoom = async (req, res) => {
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
};

exports.createDevice = async (req, res) => {
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
};

exports.updateDevice = async (req, res) => {
    const device_id = parseInt(req.params.device_id);
    const { device_name, device_power, room_id } = req.body;

    // Validasi input
    if (!device_name || !device_power || !room_id) {
        return res.status(400).json({ error: "All fields are required." });
    }

    if (isNaN(device_power) || device_power <= 0) {
        return res.status(400).json({ error: "device_power must be a positive number." });
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
};

exports.deleteDevice = async (req, res) => {
    const { device_id } = req.params;

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
};