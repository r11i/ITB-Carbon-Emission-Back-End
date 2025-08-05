const supabase = require("../../lib/supabaseClient");


exports.getEmissionsByCampus = async (req, res) => {
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
};

exports.getEmissionsByBuilding = async (req, res) => {
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
};

exports.getEmissionsByDevice = async (req, res) => {
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
};
