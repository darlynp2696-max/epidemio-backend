const pool = require('../config/database');

const getStats = async (req, res) => {
  try {
    const { date_from, date_to, community } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (date_from) { conditions.push(`report_date >= $${idx++}`); params.push(date_from); }
    if (date_to)   { conditions.push(`report_date <= $${idx++}`); params.push(date_to); }
    if (community) { conditions.push(`community ILIKE $${idx++}`); params.push(`%${community}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [totals, byDisease, byCommunity, byStatus, timeSeries] = await Promise.all([
      // Totals
      pool.query(
        `SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE status = 'confirmed')     AS confirmed,
          COUNT(*) FILTER (WHERE status = 'suspected')     AS suspected,
          COUNT(*) FILTER (WHERE status = 'discarded')     AS discarded,
          COUNT(*) FILTER (WHERE status = 'recovered')     AS recovered,
          COUNT(*) FILTER (WHERE status = 'deceased')      AS deceased
         FROM cases ${where}`,
        params
      ),
      // By disease
      pool.query(
        `SELECT d.name AS disease_name, d.code AS disease_code, d.color, d.category,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE c.status = 'confirmed') AS confirmed
         FROM cases c
         JOIN diseases d ON c.disease_id = d.id
         ${where}
         GROUP BY d.id, d.name, d.code, d.color, d.category
         ORDER BY total DESC`,
        params
      ),
      // By community
      pool.query(
        `SELECT community, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
                COUNT(*) FILTER (WHERE status = 'deceased')  AS deceased
         FROM cases ${where}
         GROUP BY community
         ORDER BY total DESC
         LIMIT 10`,
        params
      ),
      // By status
      pool.query(
        `SELECT status, COUNT(*) AS total
         FROM cases ${where}
         GROUP BY status
         ORDER BY total DESC`,
        params
      ),
      // Time series (last 60 days or filtered range)
      pool.query(
        `SELECT report_date::date AS date, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed
         FROM cases ${where}
         GROUP BY report_date::date
         ORDER BY report_date::date ASC`,
        params
      ),
    ]);

    res.json({
      totals: totals.rows[0],
      by_disease: byDisease.rows,
      by_community: byCommunity.rows,
      by_status: byStatus.rows,
      time_series: timeSeries.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

const getCommunities = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT community FROM cases WHERE community IS NOT NULL ORDER BY community`
    );
    res.json(rows.map(r => r.community));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener comunidades' });
  }
};

module.exports = { getStats, getCommunities };
