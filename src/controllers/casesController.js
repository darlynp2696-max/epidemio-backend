const pool = require('../config/database');
const XLSX = require('xlsx');

// Helper: build filter WHERE clause
const buildFilters = (query) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (query.disease_id) {
    conditions.push(`c.disease_id = $${idx++}`);
    params.push(parseInt(query.disease_id));
  }
  if (query.status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(query.status);
  }
  if (query.community) {
    conditions.push(`c.community ILIKE $${idx++}`);
    params.push(`%${query.community}%`);
  }
  if (query.date_from) {
    conditions.push(`c.report_date >= $${idx++}`);
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push(`c.report_date <= $${idx++}`);
    params.push(query.date_to);
  }
  if (query.search) {
    conditions.push(`(c.patient_code ILIKE $${idx} OR c.address ILIKE $${idx} OR c.community ILIKE $${idx})`);
    params.push(`%${query.search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
};

const getCases = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM cases c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT c.*, d.name AS disease_name, d.code AS disease_code, d.color AS disease_color,
              d.category AS disease_category,
              u.name AS reporter_name
       FROM cases c
       LEFT JOIN diseases d ON c.disease_id = d.id
       LEFT JOIN users u ON c.reporter_id = u.id
       ${where}
       ORDER BY c.report_date DESC, c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener casos' });
  }
};

// All cases for map (no pagination, only coordinates)
const getCasesForMap = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const { rows } = await pool.query(
      `SELECT c.id, c.patient_code, c.latitude, c.longitude, c.status, c.age, c.sex,
              c.community, c.report_date, c.symptom_onset_date,
              d.name AS disease_name, d.code AS disease_code, d.color AS disease_color
       FROM cases c
       LEFT JOIN diseases d ON c.disease_id = d.id
       ${where}
       ORDER BY c.report_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener casos para mapa' });
  }
};

const getCaseById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, d.name AS disease_name, d.code AS disease_code, d.color AS disease_color,
              d.category AS disease_category, u.name AS reporter_name, u.email AS reporter_email
       FROM cases c
       LEFT JOIN diseases d ON c.disease_id = d.id
       LEFT JOIN users u ON c.reporter_id = u.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener caso' });
  }
};

const createCase = async (req, res) => {
  const {
    patient_code, disease_id, latitude, longitude,
    age, sex, community, address,
    symptom_onset_date, report_date, status,
    clinical_notes, epidemiological_notes
  } = req.body;

  if (!patient_code || !disease_id || !latitude || !longitude) {
    return res.status(400).json({ error: 'Código paciente, enfermedad y coordenadas son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO cases (
        patient_code, disease_id, latitude, longitude,
        age, sex, community, address,
        symptom_onset_date, report_date, status,
        clinical_notes, epidemiological_notes, reporter_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        patient_code, parseInt(disease_id), parseFloat(latitude), parseFloat(longitude),
        age ? parseInt(age) : null, sex || null, community || null, address || null,
        symptom_onset_date || null, report_date || new Date().toISOString().split('T')[0],
        status || 'suspected', clinical_notes || null, epidemiological_notes || null,
        req.user.id
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de paciente ya existe' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al crear caso' });
  }
};

const updateCase = async (req, res) => {
  const {
    patient_code, disease_id, latitude, longitude,
    age, sex, community, address,
    symptom_onset_date, report_date, status,
    clinical_notes, epidemiological_notes
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE cases SET
        patient_code = COALESCE($1, patient_code),
        disease_id = COALESCE($2, disease_id),
        latitude = COALESCE($3, latitude),
        longitude = COALESCE($4, longitude),
        age = $5, sex = $6, community = $7, address = $8,
        symptom_onset_date = $9,
        report_date = COALESCE($10, report_date),
        status = COALESCE($11, status),
        clinical_notes = $12,
        epidemiological_notes = $13,
        updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        patient_code || null, disease_id ? parseInt(disease_id) : null,
        latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
        age ? parseInt(age) : null, sex || null, community || null, address || null,
        symptom_onset_date || null, report_date || null, status || null,
        clinical_notes || null, epidemiological_notes || null,
        req.params.id
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de paciente ya existe' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar caso' });
  }
};

const deleteCase = async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json({ message: 'Caso eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar caso' });
  }
};

const exportCases = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const { rows } = await pool.query(
      `SELECT c.patient_code, d.name AS enfermedad, c.status AS estado,
              c.latitude AS latitud, c.longitude AS longitud,
              c.age AS edad, c.sex AS sexo, c.community AS comunidad,
              c.address AS direccion, c.symptom_onset_date AS fecha_inicio_sintomas,
              c.report_date AS fecha_reporte, c.clinical_notes AS notas_clinicas,
              c.epidemiological_notes AS notas_epidemiologicas,
              u.name AS reportado_por, c.created_at AS creado_en
       FROM cases c
       LEFT JOIN diseases d ON c.disease_id = d.id
       LEFT JOIN users u ON c.reporter_id = u.id
       ${where}
       ORDER BY c.report_date DESC`,
      params
    );

    const fmt = (req.query.format || 'xlsx').toLowerCase();

    if (fmt === 'csv') {
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const csvLines = [
        headers.join(','),
        ...rows.map(r =>
          headers.map(h => {
            const v = r[h] ?? '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
              ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(',')
        )
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="casos_epidemio.csv"');
      return res.send('\uFEFF' + csvLines.join('\r\n'));
    }

    // Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Casos');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="casos_epidemio.xlsx"');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al exportar casos' });
  }
};

const importCases = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no proporcionado' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (rows.length === 0) return res.status(400).json({ error: 'El archivo está vacío' });

    // Fetch diseases for name->id mapping
    const diseaseRes = await pool.query('SELECT id, name, code FROM diseases');
    const diseaseMap = {};
    diseaseRes.rows.forEach(d => {
      diseaseMap[d.name.toLowerCase()] = d.id;
      diseaseMap[d.code.toLowerCase()] = d.id;
    });

    const validStatuses = ['suspected', 'confirmed', 'discarded', 'recovered', 'deceased'];
    const validSex = ['male', 'female', 'other'];

    const results = { success: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;

      const patient_code = r.patient_code || r.codigo_paciente || r['Código Paciente'];
      const diseaseKey = (r.enfermedad || r.disease || r.disease_name || '').toLowerCase();
      const lat = parseFloat(r.latitude || r.latitud);
      const lng = parseFloat(r.longitude || r.longitud);

      if (!patient_code || !diseaseKey || isNaN(lat) || isNaN(lng)) {
        results.errors.push({ row: rowNum, error: 'Faltan campos requeridos (patient_code, enfermedad, latitud, longitud)' });
        continue;
      }

      const disease_id = diseaseMap[diseaseKey];
      if (!disease_id) {
        results.errors.push({ row: rowNum, error: `Enfermedad no encontrada: "${diseaseKey}"` });
        continue;
      }

      const status = (r.status || r.estado || 'suspected').toLowerCase();
      const sex = (r.sex || r.sexo || '').toLowerCase();

      try {
        await pool.query(
          `INSERT INTO cases (patient_code, disease_id, latitude, longitude, age, sex,
            community, address, symptom_onset_date, report_date, status,
            clinical_notes, epidemiological_notes, reporter_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (patient_code) DO UPDATE SET
             disease_id = EXCLUDED.disease_id,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [
            patient_code, disease_id, lat, lng,
            r.age || r.edad ? parseInt(r.age || r.edad) : null,
            validSex.includes(sex) ? sex : null,
            r.community || r.comunidad || null,
            r.address || r.direccion || null,
            r.symptom_onset_date || r.fecha_inicio_sintomas || null,
            r.report_date || r.fecha_reporte || new Date().toISOString().split('T')[0],
            validStatuses.includes(status) ? status : 'suspected',
            r.clinical_notes || r.notas_clinicas || null,
            r.epidemiological_notes || r.notas_epidemiologicas || null,
            req.user.id
          ]
        );
        results.success++;
      } catch (e) {
        results.errors.push({ row: rowNum, error: e.message });
      }
    }

    res.json({
      message: `Importación completada: ${results.success} casos importados, ${results.errors.length} errores`,
      ...results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el archivo' });
  }
};

const getDiseases = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM diseases WHERE active = true ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener enfermedades' });
  }
};

module.exports = {
  getCases, getCasesForMap, getCaseById,
  createCase, updateCase, deleteCase,
  exportCases, importCases, getDiseases
};
