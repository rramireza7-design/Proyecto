const express = require("express");
const cors = require("cors");
const oracledb = require("oracledb");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Servir archivos del frontend
app.use(express.static(__dirname));

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
};

// API de servicios
app.get("/servicios", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `SELECT id_servicio,
                    nombre,
                    categoria,
                    descripcion,
                    precio,
                    icono
             FROM servicios
             ORDER BY id_servicio`,
            [],
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT
            }
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Error Oracle:", error);

        res.status(500).json({
            error: error.message
        });

    } finally {
        if (connection) {
            await connection.close();
        }
    }
});

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Puerto compatible con Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});