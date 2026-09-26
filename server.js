const express = require("express");
const cors = require("cors");
const oracledb = require("oracledb");

const app = express();

app.use(cors());
app.use(express.json());

const dbConfig = {
  user: "SYSTEM",
  password: "TU_PASSWORD",
  connectString: "localhost/XEPDB1"
};

app.get("/servicios", async (req, res) => {
  let connection;

  try {
    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT id_servicio, nombre, categoria, descripcion, precio, icono
       FROM servicios
       ORDER BY id_servicio`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.close();
  }
});

app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});