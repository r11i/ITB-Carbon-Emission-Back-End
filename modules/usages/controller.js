const supabase = require("../../lib/supabaseClient");

exports.createUsage = async (req, res) => {
  const { device_id, usage_hours, year, month, day } = req.body;

  if (!device_id || usage_hours == null || !year || !month || !day) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const { data: existingData, error: checkError } = await supabase
      .from("DeviceUsage")
      .select("usage_id")
      .eq("device_id", device_id)
      .eq("year", year)
      .eq("month", month)
      .eq("day", day)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingData) {
      return res.status(409).json({ error: "Usage data for this date already exists." });
    }

    const { data, error } = await supabase
      .from("DeviceUsage")
      .insert([{ device_id, usage_hours, year, month, day }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Usage record created successfully", usage: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUsage = async (req, res) => {
  const { usage_id, device_id, usage_hours, year, month, day } = req.body;

  if (!usage_id || !device_id || usage_hours == null || !year || !month || !day) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const { data, error } = await supabase
      .from("DeviceUsage")
      .update({ device_id, usage_hours, year, month, day })
      .eq("usage_id", usage_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Usage record updated successfully", usage: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUsage = async (req, res) => {
  const { usage_id } = req.body;

  if (!usage_id) {
    return res.status(400).json({ error: "usage_id is required." });
  }

  try {
    const { data: existingUsage, error: fetchError } = await supabase
      .from("DeviceUsage")
      .select("*")
      .eq("usage_id", usage_id)
      .maybeSingle();

    if (fetchError || !existingUsage) {
      return res.status(404).json({ error: "Usage record not found." });
    }

    const { error: deleteError } = await supabase
      .from("DeviceUsage")
      .delete()
      .eq("usage_id", usage_id);

    if (deleteError) throw deleteError;

    res.json({ message: "Usage record deleted successfully.", deleted_usage_id: usage_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDeviceUsageByDeviceId = async (req, res) => {
  const { device_id } = req.query;

  if (!device_id) {
    return res.status(400).json({ error: "device_id is required as query parameter." });
  }

  try {
    const { data, error } = await supabase
      .from("DeviceUsage")
      .select("*")
      .eq("device_id", device_id)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (error) throw error;

    res.status(200).json({
      device_id,
      usage_records: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
