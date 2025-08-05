const supabase = require("../../lib/supabaseClient");

exports.getAllCampuses = async (req, res) => {
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
};

exports.getBuildingsByCampus = async (req, res) => {
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
};

exports.getRoomsByBuilding = async (req, res) => {
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
};
